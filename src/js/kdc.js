/**
 * @preserve Copyright (c) 2013 David Benjamin and Alan Huang
 * Use of this source code is governed by an MIT-style license that
 * can be found at
 * https://github.com/davidben/webathena
 */
// Only place in first file of each bundle.
"use strict";

var Crypto = {};

Crypto.randomNonce = function() {
    var word = sjcl.random.randomWords(1)[0];
    // Twos-complement it if negative.
    if (word < 0)
        word += 0x80000000;
    return word;
};

Crypto.waitForEntropy = async function () {
    while (!sjcl.random.isReady()) {
        await sleep(250);
    }
};

import arrayutils from './arrayutils.js';
import kcrypto from './kcrypto.js';
import krb from './krb.js';

var KDC = {};

KDC.urlBase = './kdc/v1/';

/** @constructor */
KDC.Error = function(code, message) {
    this.code = code;
    this.message = message;
};
KDC.Error.prototype.toString = function() {
    return "KDC Error " + this.code + ": " + this.message;
};
/** @constructor */
KDC.NetworkError = function(message) {
    this.message = message;
};
KDC.NetworkError.prototype.toString = function() {
    return this.message;
};
/** @constructor */
KDC.ProtocolError = function(message) {
    this.message = message;
};
KDC.ProtocolError.prototype.toString = function() {
    return "Protocol error: " + this.message;
};

KDC.xhrRequest = async function(data, target) {
    var init = {
        method: 'POST'
    };
    if (data) {
        init.headers = {
            'Content-Type': 'text/plain'
        };
        init.body = arrayutils.toBase64(data);
    }
    const response = await fetch(KDC.urlBase + target, init);
    if (response.ok) {
        return response.text();
    } else if (response.type == 'error') {
        throw response.error();
    } else {
        var message = 'HTTP error ' + response.status;
        if (response.statusText) {
            message += ': ' + response.statusText;
        }
        throw new KDC.NetworkError(message);
    }
};

KDC.kdcProxyRequest = async function(data, target, outputType, useMaster) {
    if (useMaster) {
        target += '?use_master';
    }
    const respText = await KDC.xhrRequest(data, target);
    const respData = JSON.parse(respText);
    switch (respData.status) {
    case 'ERROR':
        throw new KDC.NetworkError(respData.msg);
    case 'TIMEOUT':
        throw new KDC.NetworkError('KDC connection timed out');
    case 'OK':
        var der = arrayutils.fromBase64(respData.reply);
        return outputType.decodeDER(der)[1];
    }
};

KDC.asReq = async function(principal, padata, useMaster) {
    await Crypto.waitForEntropy();
    var asReq = {};
    asReq.pvno = krb.pvno;
    asReq.msgType = krb.KRB_MT_AS_REQ;
    // TODO: padata will likely want to be a more interesting
    // callback for ones which depend on, say, the reqBody.
    if (padata != null)
        asReq.padata = padata;

    // FIXME: This is obnoxious. Also constants.
    asReq.reqBody = {};
    // TODO: Pick a reasonable set of flags. These are just
    // taken from a wireshark trace.
    asReq.reqBody.kdcOptions = krb.KDCOptions.make(
        krb.KDCOptions.forwardable,
        krb.KDCOptions.proxiable,
        krb.KDCOptions.renewable_ok);

    if (principal.realm != krb.realm)
        throw "Cross-realm not supported!";
    asReq.reqBody.principalName = principal.principalName;

    asReq.reqBody.realm = krb.realm;

    asReq.reqBody.sname = {};
    asReq.reqBody.sname.nameType = krb.KRB_NT_SRV_INST;
    asReq.reqBody.sname.nameString = [ 'krbtgt', krb.realm ];

    asReq.reqBody.till = new Date(0);
    asReq.reqBody.nonce = Crypto.randomNonce();
    asReq.reqBody.etype = krb.supportedEnctypes;

    var asRep = await KDC.kdcProxyRequest(krb.AS_REQ.encodeDER(asReq),
                                          'AS_REQ', krb.AS_REP_OR_ERROR, useMaster);
    return {
        asReq: asReq,
        asRep: asRep,
    };
};

function extractPreAuthHint(methodData) {
    // The preferred ordering of the "hint" pre-authentication data
    // that affect client key selection is: ETYPE-INFO2, followed by
    // ETYPE-INFO, followed by PW-SALT.  As noted in Section 3.1.3, a
    // KDC MUST NOT send ETYPE-INFO or PW-SALT when the client's
    // AS-REQ includes at least one "newer" etype.
    for (var i = 0; i < methodData.length; i++) {
        // The type of the salt changed from OCTET STRING to
        // GeneralString between PA-ETYPE-INFO and
        // PA-ETYPE-INFO2. Arbitrarily declare that typed array is
        // the representation.
        if (methodData[i].padataType == krb.PA_ETYPE_INFO2) {
            var infos = krb.ETYPE_INFO2.decodeDER(methodData[i].padataValue);
            infos.forEach(function(info) {
                if (info.salt !== undefined)
                    info.salt = arrayutils.fromString(info.salt);
            });
            return infos;
        }
    }
    for (var i = 0; i < methodData.length; i++) {
        if (methodData[i].padataType == krb.PA_ETYPE_INFO)
            return krb.ETYPE_INFO.decodeDER(methodData[i].padataValue);
    }
    for (var i = 0; i < methodData.length; i++) {
        if (methodData[i].padataType == krb.PA_PW_SALT)
            return [ { salt: methodData[i].padataValue } ];
    }
    return [];
}
function defaultSaltForPrincipal(principal) {
    // The default salt string, if none is provided via
    // pre-authentication data, is the concatenation of the
    // principal's realm and name components, in order, with no
    // separators.
    return arrayutils.fromString(
        principal.realm + principal.principalName.nameString.join(""));
}
function keyFromPassword(etypeInfo, principal, password) {
    var salt;
    if ("salt" in etypeInfo)
        salt = etypeInfo.salt;
    else
        salt = defaultSaltForPrincipal(principal);
    return krb.Key.fromPassword(etypeInfo.etype,
                                password, salt, etypeInfo.s2kparams);
}

var padataHandlers = { };
// TODO: Implement other types of PA-DATA.
padataHandlers[krb.PA_ENC_TIMESTAMP] = async function(asReq, asRep, methodData,
                                                      paData, principal,
                                                      password) {
    var etypeInfos = extractPreAuthHint(methodData);
    var etypeInfo = null;
    // Find an enctype we support.
    for (var j = 0; j < etypeInfos.length; j++) {
        if (etypeInfos[j].etype in kcrypto.encProfiles) {
            etypeInfo = etypeInfos[j];
            break;
        }
    }
    if (etypeInfo === null)
        throw new kcrypto.NotSupportedError('No supported enctypes');

    // Derive a key.
    var key = keyFromPassword(etypeInfo, principal, password);

    // Encrypt a timestamp.
    await Crypto.waitForEntropy();
    var ts = { };
    ts.patimestamp = new Date();
    ts.pausec = ts.patimestamp.getUTCMilliseconds() * 1000;
    ts.patimestamp.setUTCMilliseconds(0);
    var encTs = key.encryptAs(
        krb.ENC_TS_ENC, krb.KU_AS_REQ_PA_ENC_TIMESTAMP, ts);
    return {
        padataType: krb.PA_ENC_TIMESTAMP,
        padataValue: krb.ENC_TIMESTAMP.encodeDER(encTs)
    };
};

KDC.getTGTSession = async function (principal, password, useMaster) {
    try {
        var { asReq, asRep } = await KDC.asReq(principal, null, useMaster);

        // Handle pre-authentication.
        if (asRep.msgType == krb.KRB_MT_ERROR &&
            asRep.errorCode == krb.KDC_ERR_PREAUTH_REQUIRED) {
            // Got a pre-auth request. Retry with pre-auth. Pick the
            // first PA-DATA we can handle.
            // TODO: Implement RFC 6113.
            var methodData = krb.METHOD_DATA.decodeDER(asRep.eData);
            for (var i = 0; i < methodData.length; i++) {
                if (methodData[i].padataType in padataHandlers) {
                    // Found one we have a handler for. Pre-auth
                    // and redo the request.
                    var padata = await padataHandlers[methodData[i].padataType](
                        asReq, asRep, methodData, methodData[i],
                        principal, password);
                    ({ asReq, asRep } = await KDC.asReq(principal, [padata], useMaster));
                }
            }
        }
        // Handle errors.
        if (asRep.msgType == krb.KRB_MT_ERROR)
            throw new KDC.Error(asRep.errorCode, asRep.eText);

        // If any padata fields are present, they may be used to
        // derive the proper secret key to decrypt the message.
        var etypeInfo = { };
        if (asRep.padata) {
            var etypeInfos = extractPreAuthHint(asRep.padata);
            if (etypeInfos) {
                if (etypeInfos.length != 1)
                    throw new KDC.ProtocolError("Bad pre-auth hint");
                etypeInfo = etypeInfos[0];
                if ("etype" in etypeInfo &&
                    etypeInfo.etype != asRep.encPart.etype)
                    throw new KDC.ProtocolError("Bad pre-auth hint");
            }
        }
        etypeInfo.etype = asRep.encPart.etype;
        var key = keyFromPassword(etypeInfo, principal, password);

        // The key usage value for encrypting this field is 3 in
        // an AS-REP message, using the client's long-term key or
        // another key selected via pre-authentication mechanisms.
        return await KDC.sessionFromKDCRep(key, krb.KU_AS_REQ_ENC_PART,
                                             asReq, asRep);
    } catch (err1) {
        // On failure, fall back to the master, a la MIT Kerberos.
        // TODO(davidben): Don't fallback if we happened to be talking
        // to the master anyway.
        if (!useMaster) {
            log('Falling back to master', err1);
            try {
                return await KDC.getTGTSession(principal, password, true);
            } catch (err2) {
                if (err2 instanceof KDC.NetworkError) {
                    log('Could not reach master: ' + err2);
                    throw err1;
                }
                throw err2;
            }
        }
        throw err1;
    }
};

KDC.sessionFromKDCRep = function (key, keyUsage, kdcReq, kdcRep) {
    // 3.1.5.  Receipt of KRB_AS_REP Message

    // If the reply message type is KRB_AS_REP, then the
    // client verifies that the cname and crealm fields in the
    // cleartext portion of the reply match what it requested.
    if (kdcReq.reqBody.principalName) {
        // If we didn't send principalName (because it was a TGS_REQ)
        // do we still check stuff?
        if(kdcRep.crealm != kdcReq.reqBody.realm)
            throw new KDC.ProtocolError('crealm does not match');
        if(!krb.principalNamesEqual(kdcReq.reqBody.principalName,
                                    kdcRep.cname))
            throw new KDC.ProtocolError('cname does not match');
    }

    // The client decrypts the encrypted part of the response
    // using its secret key...
    try {
        var encRepPart = key.decryptAs(krb.EncASorTGSRepPart,
                                       keyUsage, kdcRep.encPart)[1];
    } catch (e) {
        if (e instanceof krb.KeyTypeMismatchError)
            throw new KDC.ProtocolError('enctype does not match');
        throw e;
    }

    // ...and verifies that the nonce in the encrypted part
    // matches the nonce it supplied in its request (to detect
    // replays).
    if (kdcReq.reqBody.nonce != encRepPart.nonce)
        throw new KDC.ProtocolError('nonce does not match');

    // It also verifies that the sname and srealm in the
    // response match those in the request (or are otherwise
    // expected values), and that the host address field is
    // also correct.
    if (!krb.principalNamesEqual(kdcReq.reqBody.sname, encRepPart.sname))
        throw new KDC.ProtocolError('sname does not match');

    // It then stores the ticket, session key, start and
    // expiration times, and other information for later use.
    return new krb.Session(kdcRep, encRepPart);

    // TODO: Do we want to do anything with last-req and
    // authtime?
};

KDC.getServiceSession = async function(session, service) {
    await Crypto.waitForEntropy();
    var tgsReq = { };
    tgsReq.pvno = krb.pvno;
    tgsReq.msgType = krb.KRB_MT_TGS_REQ;

    tgsReq.reqBody = { };
    // TODO: What flags?
    tgsReq.reqBody.kdcOptions = krb.KDCOptions.make(
        krb.KDCOptions.forwardable);
    tgsReq.reqBody.sname = service.principalName;
    tgsReq.reqBody.realm = service.realm;

    // TODO: Do we want to request the maximum end time? Seems a
    // reasonable default I guess.
    tgsReq.reqBody.till = new Date(0);
    tgsReq.reqBody.nonce = Crypto.randomNonce();
    tgsReq.reqBody.etype = krb.supportedEnctypes;

    // Checksum the reqBody. Note: if our DER encoder isn't completely
    // correct, the proxy will re-encode it and possibly mess up the
    // checksum. This is probably a little poor.
    var checksum = session.key.checksum(
        krb.KU_TGS_REQ_PA_TGS_REQ_CKSUM,
        krb.KDC_REQ_BODY.encodeDER(tgsReq.reqBody));

    // Requests for additional tickets (KRB_TGS_REQ) MUST contain a
    // padata of PA-TGS-REQ.
    var apReq = session.makeAPReq(
        krb.KU_TGS_REQ_PA_TGS_REQ, checksum).apReq;
    tgsReq.padata = [{ padataType: krb.PA_TGS_REQ,
                       padataValue: krb.AP_REQ.encodeDER(apReq) }];

    var tgsRep = await KDC.kdcProxyRequest(krb.TGS_REQ.encodeDER(tgsReq),
                                           'TGS_REQ', krb.TGS_REP_OR_ERROR);
    if (tgsRep.msgType == krb.KRB_MT_ERROR)
        throw new KDC.Error(tgsRep.errorCode, tgsRep.eText);

    // When the KRB_TGS_REP is received by the client, it is processed
    // in the same manner as the KRB_AS_REP processing described
    // above.  The primary difference is that the ciphertext part of
    // the response must be decrypted using the sub-session key from
    // the Authenticator, if it was specified in the request, or the
    // session key from the TGT, rather than the client's secret key.
    //
    // If we use a subkey, the usage might change I think.
    return KDC.sessionFromKDCRep(
        session.key, krb.KU_TGS_REQ_ENC_PART, tgsReq, tgsRep);

};

export default KDC;
