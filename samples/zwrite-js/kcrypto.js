var kcrypto = (function() {
    "use strict";

    var kcrypto = { };

    kcrypto.DecryptionError = function(message) {
        this.message = message;
    };
    kcrypto.DecryptionError.prototype.toString = function() {
        return "DecryptionError: " + this.message;
    };
    kcrypto.InvalidParameters = function(message) {
        this.message = message;
    };
    kcrypto.InvalidParameters.prototype.toString = function() {
        return "InvalidParameters: " + this.message;
    };

    // 3.  Encryption Algorithm Profile
    //
    // An encryption profile includes the following methods:
    //
    //  var encryptionProfile = {
    //    checksum: <a checksum profile>,
    //    keyGenerationSeedLength: <Number K>,
    //    stringToKey: function (pass, salt, opaque) -> protocolKey,
    //    randomToKey: function (bitstring[K) -> protocolKey,
    //    deriveKey: function (protocolKey, Number) -> specificKey,
    //    defaultStringToKeyParameters: <octet string>,
    //    initialCipherState: function (specificKey, direction) -> state,
    //    encrypt: function (specificKey, state, string) -> [state, string],
    //    decrypt: function (specificKey, state, string) -> [state, string],
    //    pseudoRandom: function (protocolKey, string) -> string
    //  };
    //
    //  var checksumProfile = {
    //    getMic: function (?) -> ?,
    //    verifyMic: function (?) -> ?
    //  };
    //
    // Stuff to deal with: these strings are UTF-8 strings and octet
    // strings.

    // 5.2.  Simplified Profile Parameters
    //
    //  var simplifiedProfile = {
    //    stringToKey: function (pass, salt, opaque) -> protocolKey,
    //    defaultStringToKeyParam: <octet string>,
    //    keyGenerationSeedLength: <Number K>,
    //    randomToKey: function (bitstring[K] -> protocolKey,
    //    unkeyedHash: instance of sjcl.hash.something for now
    //    hmacOutputSize: <Number h>,
    //    messageBlockSize: <Number m>,
    //    encrypt: function (key, state, string) -> [state, string],
    //    decrypt: function (key, state, string) -> [state, string],
    //    cipherBlockSize: <Number c>
    //  };
    //
    // Each function is also passed the resulting profile as the last
    // argument since AES refers to things computed by the full
    // profile in terms of the simple profile. It's annoying.

    // 8.  Assigned Numbers
    kcrypto.enctype = {};
    kcrypto.enctype.des_cbc_crc                     =  1;
    kcrypto.enctype.des_cbc_md4                     =  2;
    kcrypto.enctype.des_cbc_md5                     =  3;
    kcrypto.enctype.des3_cbc_md5                    =  5;
    kcrypto.enctype.des3_cbc_sha1                   =  7;
    kcrypto.enctype.dsaWithSHA1_CmsOID              =  9;
    kcrypto.enctype.md5WithRSAEncryption_CmsOID     = 10;
    kcrypto.enctype.sha1WithRSAEncryption_CmsOID    = 11;
    kcrypto.enctype.rc2CBC_EnvOID                   = 12;
    kcrypto.enctype.rsaEncryption_EnvOID            = 13;
    kcrypto.enctype.rsaES_OAEP_ENV_OID              = 14;
    kcrypto.enctype.des_ede3_cbc_Env_OID            = 15;
    kcrypto.enctype.des3_cbc_sha1_kd                = 16;
    kcrypto.enctype.aes128_cts_hmac_sha1_96         = 17;
    kcrypto.enctype.aes256_cts_hmac_sha1_96         = 18;
    kcrypto.enctype.rc4_hmac                        = 23;
    kcrypto.enctype.rc4_hmac_exp                    = 24;
    kcrypto.enctype.subkey_keymaterial              = 65;

    kcrypto.sumtype = {};
    kcrypto.sumtype.CRC32                         =  1;
    kcrypto.sumtype.rsa_md4                       =  2;
    kcrypto.sumtype.rsa_md4_des                   =  3;
    kcrypto.sumtype.des_mac                       =  4;
    kcrypto.sumtype.des_mac_k                     =  5;
    kcrypto.sumtype.rsa_md4_des_k                 =  6;
    kcrypto.sumtype.rsa_md5                       =  7;
    kcrypto.sumtype.rsa_md5_des                   =  8;
    kcrypto.sumtype.rsa_md5_des3                  =  9;
    kcrypto.sumtype.sha1                          = 10;
    kcrypto.sumtype.hmac_sha1_des3_kd             = 12;
    kcrypto.sumtype.hmac_sha1_des3                = 13;
    kcrypto.sumtype.sha1_2                        = 14;
    kcrypto.sumtype.hmac_sha1_96_aes128           = 15;
    kcrypto.sumtype.hmac_sha1_96_aes256           = 16;

    // Why is this so hard??
    function sjclZeroArray(n) {
        var ret = [];
        while (n >= 32) {
            ret.push(0);
            n -= 32;
        }
        if (n > 0)
            ret.push(sjcl.bitArray.partial(n, 0));
        return ret;
    }

    // CBC-CTS encryption mode for SJCL. Adapted from sjcl.mode.cbc.
    function pad128(l) {
        l[l.length - 1] >>>= 0;
        while (l.length < 4)
            l.push(0);
    }
    function xor4(x,y) {
        return [x[0]^y[0],x[1]^y[1],x[2]^y[2],x[3]^y[3]];
    }
    var cbcCtsMode = {
        encrypt: function(prp, plaintext, iv, adata) {
            if (adata && adata.length) {
                throw new sjcl.exception.invalid("cbc can't authenticate data");
            }
            if (sjcl.bitArray.bitLength(iv) !== 128) {
                throw new sjcl.exception.invalid("cbc iv must be 128 bits");
            }
            var i,
            w = sjcl.bitArray,
            bl = w.bitLength(plaintext),
            output = [];

            /* CTS can't handle short plaintexts. Caller checks for this. */
            if (bl <= 128) {
                throw new sjcl.exception.invalid(
                    "plaintext must be more than 128 bits");
            }

            /* Encrypt all but the last two blocks as in CBC. */
            for (i=0; i+8 < plaintext.length; i+=4) {
                iv = prp.encrypt(xor4(iv, plaintext.slice(i,i+4)));
                output.splice(i,0,iv[0],iv[1],iv[2],iv[3]);
            }
            /* Encrypt the second-to-last block. */
            iv = prp.encrypt(xor4(iv, plaintext.slice(i,i+4)));
            /* Pad the last block with zeros. */
            var last = plaintext.slice(i+4, i+8);
            var lastLen = w.bitLength(last);
            pad128(last);
            /* Second-to-last cipher block is E(iv|last) */
            var lastc = prp.encrypt(xor4(iv, last));
            output.push(lastc[0], lastc[1], lastc[2], lastc[3]);
            /* Last cipher-block is iv truncated. */
            var ivTrunc = w.clamp(iv, lastLen);
            for (i = 0; i < ivTrunc.length; i++)
                output.push(ivTrunc[i]);
            return output;
        },
        decrypt: function(prp, ciphertext, iv, adata) {
            if (adata && adata.length) {
                throw new sjcl.exception.invalid("cbc can't authenticate data");
            }
            if (sjcl.bitArray.bitLength(iv) !== 128) {
                throw new sjcl.exception.invalid("cbc iv must be 128 bits");
            }
            var cl = sjcl.bitArray.bitLength(ciphertext);
            if (cl <= 128) {
                throw new sjcl.exception.corrupt(
                    "cbc-cts ciphertext must be at least two blocks");
            }
            var i,
            w = sjcl.bitArray,
            bi, bo,
            output = [];

            /* Decrypt all but the last two blocks. */
            for (i=0; i+8 < ciphertext.length; i+=4) {
                bi = ciphertext.slice(i,i+4);
                bo = xor4(iv,prp.decrypt(bi));
                output.splice(i,0,bo[0],bo[1],bo[2],bo[3]);
                iv = bi;
            }
            /* Decrypt the second to last block with IV 0. */
            var d = prp.decrypt(ciphertext.slice(i,i+4));
            /* Pad the last ciphertext block with zeros. */
            var c = ciphertext.slice(i+4, i+8);
            var cLength = w.bitLength(c);
            pad128(c);
            /* C xor D is Pn* | {Cn's truncated bits} */
            var x = xor4(c, d);
            var pn = w.clamp(x, cLength);
            /* Recover the original Cn. */
            var pnPad = pn.slice(0);
            pad128(pnPad);
            var cn = xor4(c, xor4(pnPad, x));
            /* Decrypt with iv to get Pn-1 */
            var pn1 = xor4(iv, prp.decrypt(cn));

            /* Assemble the output. */
            output.push(pn1[0], pn1[1], pn1[2], pn1[3]);
            for (i = 0; i < pn.length; i++)
                output.push(pn[i]);
            return output;
        }
    };

    function gcd(a, b) {
        var tmp;
        if (b < a) {
            tmp = a;
            a = b;
            b = tmp;
        }
        while (a != 0) {
            tmp = b % a;
            b = a;
            a = tmp;
        }
        return b;
    }
    // both parameters are always well-known constants, so n-fold
    // needn't be constant-time or anything. Really we could just
    // precompute all the n-folds we need.
    function onesComplementAdd(a, b) {
        if (sjcl.bitArray.bitLength(a) != sjcl.bitArray.bitLength(b))
            throw "Lengths must match";
        if (a.length == 0)
            return [];

        var lastPartial = sjcl.bitArray.getPartial(a[a.length - 1]);
        var word = 0;
        var ret = a.slice(0);
        word += (ret[ret.length - 1] >>> 0) + (b[ret.length - 1] >>> 0);
        ret[ret.length - 1] = sjcl.bitArray.partial(lastPartial, word >>> 0, 1);
        word = (word > 0x100000000) ? 1 : 0;
        for (var i = ret.length - 2; i >= 0; i--) {
            word += (ret[i] >>> 0) + (b[i] >>> 0);
            ret[i] = word >>> 0;
            word = (word >= 0x100000000) ? 1 : 0;
        }
        // Carry.
        if (word > 0) {
            word = (1 << (32 - lastPartial)) + (ret[ret.length - 1] >>> 0);
            ret[ret.length - 1] =
                sjcl.bitArray.partial(lastPartial, word >>> 0, 1);
            if (word >= 0x100000000) {
                for (var i = ret.length - 2; i >= 0; i--) {
                    word = 1 + (ret[i] >>> 0);
                    ret[i] = word >>> 0;
                    if (word < 0x100000000)
                        break;
                }
            }
        }
        return ret;
    }
    function nFold(n, input) {
        var inBits = sjcl.codec.byteString.toBits(input);
        var inLength = sjcl.bitArray.bitLength(inBits);
        var numCopies = n / gcd(n, inLength);
        var shift = 13 % inLength;

        var ret = sjclZeroArray(n);
        var chunk = []; var chunkLength = 0;
        var lastCopy = inBits;
        for (var i = 0; i < numCopies; i++) {
            // Append the chunk.
            chunk = sjcl.bitArray.concat(chunk, lastCopy);
            chunkLength += inLength;
            // Rotate the next one by 13 bits.
            lastCopy = sjcl.bitArray.concat(
                sjcl.bitArray.bitSlice(lastCopy, inLength - shift),
                sjcl.bitArray.bitSlice(lastCopy, 0, inLength - shift));
            // If we have a completed chunk, add and remove it.
            while (chunkLength >= n) {
                ret = onesComplementAdd(
                    ret, sjcl.bitArray.bitSlice(chunk, 0, n));
                chunk = sjcl.bitArray.bitSlice(chunk, n);
                chunkLength -= n;
            }
        }
        if (sjcl.bitArray.bitLength(chunk) != 0)
            throw "Bits left over!";
        return sjcl.codec.byteString.fromBits(ret);
    }

    // 5.3.  Cryptosystem Profile Based on Simple Profile
    function profilesFromSimpleProfile(simpleProfile) {
        if (simpleProfile.keyGenerationSeedLength % 8 != 0)
            throw "Bad simple profile";

        function truncatedHmac(hmac, msg) {
            // FIXME: Round-tripping between String and sjcl.bitArray
            // is a pain.
            var h1 = hmac.encrypt(sjcl.codec.byteString.toBits(msg));
            h1 = sjcl.bitArray.bitSlice(
                h1, 0, 8 * simpleProfile.hmacOutputSize);
            return sjcl.codec.byteString.fromBits(h1);
        }

        var enc = { };
        enc.enctype = simpleProfile.enctype;
        var initialCipherState = ""
        for (var i = 0; i < simpleProfile.cipherBlockSize; i++) {
            initialCipherState += "\0";
        }
        enc.initialCipherState = function() {
            return initialCipherState;
        };
        enc.randomToKey = function(random) {
            return simpleProfile.randomToKey(random);
        };
        enc.stringToKey = function(pass, salt, param) {
            return simpleProfile.stringToKey(pass, salt, param, this);
        };
        enc.encrypt = function(derivedKey, iv, plaintext) {
            // conf = Random string of length c
            var conf = sjcl.bitArray.clamp(
                sjcl.random.randomWords(
                    Math.ceil(simpleProfile.cipherBlockSize / 4)),
                simpleProfile.cipherBlockSize * 8);
            // pad = Shortest string to bring confounder and plaintext
            // to a length that's a multiple of m.
            var padLength = (simpleProfile.cipherBlockSize + plaintext.length) %
                simpleProfile.messageBlockSize;
            padLength = simpleProfile.messageBlockSize - padLength;
            if (padLength == simpleProfile.messageBlockSize)
                padLength = 0;
            var pad = sjclZeroArray(padLength * 8);
            // (C1, newIV) = E(Ke, conf | plaintext | pad, oldstate.ivec)
            var data = sjcl.codec.byteString.fromBits(conf) +
                plaintext + sjcl.codec.byteString.fromBits(pad);
            var t = simpleProfile.encrypt(derivedKey.E, iv, data, this);
            var newIV = t[0], c1 = t[1];
            // H1 = HMAC(Ki, conf | plaintext | pad)
            var h1 = truncatedHmac(derivedKey.I, data);
            // ciphertext =  C1 | H1[1..h]
            // newstate.ivec = newIV
            return [newIV, c1 + h1];
        };
        enc.decrypt = function(derivedKey, iv, ciphertext) {
            // (C1,H1) = ciphertext
            var c1 = ciphertext.substr(
                0, ciphertext.length - simpleProfile.hmacOutputSize);
            var h1 = ciphertext.substr(
                ciphertext.length - simpleProfile.hmacOutputSize);
            // (P1, newIV) = D(Ke, C1, oldstate.ivec)
            var t = simpleProfile.decrypt(derivedKey.E, iv, c1, this);
            var newIV = t[0], p1 = t[1];
            // if (H1 != HMAC(Ki, P1)[1..h]) report error
            if (h1 != truncatedHmac(derivedKey.I, p1))
                throw new kcrypto.DecryptionError('Checksum mismatch!');
            // Strip off confounder.
            p1 = p1.substr(simpleProfile.cipherBlockSize);
            return [newIV, p1];
        };
        enc.DK = function(key, constant) {
            // If the Constant is smaller than the cipher block size
            // of E, then it must be expanded with n-fold() so it can
            // be encrypted.
            // FIXME: smaller? What about equal?
            if (constant.length < simpleProfile.cipherBlockSize) {
                constant = nFold(simpleProfile.cipherBlockSize * 8, constant);
            }
            var DR = "";
            var truncateLength = simpleProfile.keyGenerationSeedLength / 8;
            var state = constant;
            // If the output of E is shorter than k bits, it is fed
            // back into the encryption as many times as necessary.
            while (DR.length < truncateLength) {
                state = simpleProfile.encrypt(
                    key, initialCipherState, state)[1];
                DR += state;
            }
            DR = DR.substr(0, truncateLength);
            return this.randomToKey(DR);
        };
        enc.deriveKey = function(key, usage) {
            // The "well-known constant" used for the DK function is
            // the key usage number, expressed as four octets in
            // big-endian order, followed by one octet indicated
            // below.
            var usageBytes = String.fromCharCode(
                usage >>> 24,
                (usage >>> 16) & 0xff,
                (usage >>> 8) & 0xff,
                usage & 0xff);
            // Kc = DK(base-key, usage | 0x99);
            var Kc = this.DK(key, usageBytes + '\x99');
            // Ke = DK(base-key, usage | 0xAA);
            var Ke = this.DK(key, usageBytes + '\xAA');
            // Ki = DK(base-key, usage | 0x55);
            var Ki = this.DK(key, usageBytes + '\x55');
            return {
                C: new sjcl.misc.hmac(
                    sjcl.codec.byteString.toBits(Kc),
                    simpleProfile.unkeyedHash),
                // FIXME: Cache the profile-specific key object
                // here. AES does a fair amount of precomputation. Not
                // quite as easy as putting it in randomToKey as
                // that's called to make an HMAC key too.
                E: Ke,
                I: new sjcl.misc.hmac(
                    sjcl.codec.byteString.toBits(Ki),
                    simpleProfile.unkeyedHash)
            };
        };

        var checksum = { };
        checksum.sumtype = simpleProfile.sumtype;
        checksum.checksumBytes = simpleProfile.hmacOutputSize;
        checksum.getMic = function(key, msg) {
            return truncatedHmac(key.C, msg);
        };
        checksum.verifyMic = function(key, msg, token) {
            return token == this.getMic(key, msg);
        };

        enc.checksum = checksum;

        return [enc, checksum];
    }

    // 6.1.1.  The RSA MD5 Checksum
    kcrypto.RsaMd5Checksum = {
        sumtype: kcrypto.sumtype.rsa_md5,
        checksumBytes: 16,
        getMic: function (key, msg) {
            msg = CryptoJS.enc.Latin1.parse(msg);
            var hash = CryptoJS.MD5(msg);
            return CryptoJS.enc.Latin1.stringify(hash);
        },
        verifyMic: function (key, msg, token) {
            return token == this.getMic(key, msg);
        }
    };

    // 6.1.3.  CRC-32 Checksum
    kcrypto.Crc32Checksum = {
        sumtype: kcrypto.sumtype.CRC32,
        checksumBytes: 4,
        getMic: function (key, msg) {
            // The CRC-32 checksum used in the des-cbc-crc encryption
            // mode is identical to the 32-bit FCS described in ISO
            // 3309 with two exceptions: The sum with the all-ones
            // polynomial times x**k is omitted, and the final
            // remainder is not ones-complemented.

            // This seems to be correct. (It's also what pykrb5 does.)
            var checksum = crc32(msg, 0xffffffff) ^ 0xffffffff;
            // Get it into a string, little-endian.
            return String.fromCharCode(checksum & 0xff,
                                       (checksum >>> 8) & 0xff,
                                       (checksum >>> 16) & 0xff,
                                       (checksum >>> 24) & 0xff);
        },
        verifyMic: function (key, msg, token) {
            return token == this.getMic(key, msg);
        }
    };

    // 6.2.  DES-Based Encryption and Checksum Types
    var sevenBitReverseTable = [
        0, 64, 32, 96, 16, 80, 48, 112, 8, 72, 40, 104, 24, 88, 56, 120, 4, 68,
        36, 100, 20, 84, 52, 116, 12, 76, 44, 108, 28, 92, 60, 124, 2, 66, 34,
        98, 18, 82, 50, 114, 10, 74, 42, 106, 26, 90, 58, 122, 6, 70, 38, 102,
        22, 86, 54, 118, 14, 78, 46, 110, 30, 94, 62, 126, 1, 65, 33, 97, 17,
        81, 49, 113, 9, 73, 41, 105, 25, 89, 57, 121, 5, 69, 37, 101, 21, 85,
        53, 117, 13, 77, 45, 109, 29, 93, 61, 125, 3, 67, 35, 99, 19, 83, 51,
        115, 11, 75, 43, 107, 27, 91, 59, 123, 7, 71, 39, 103, 23, 87, 55, 119,
        15, 79, 47, 111, 31, 95, 63, 127
    ];

    var desParityBitTable = [
        1, 2, 4, 7, 8, 11, 13, 14, 16, 19,
        21, 22, 25, 26, 28, 31, 32, 35, 37, 38,
        41, 42, 44, 47, 49, 50, 52, 55, 56, 59,
        61, 62, 64, 67, 69, 70, 73, 74, 76, 79,
        81, 82, 84, 87, 88, 91, 93, 94, 97, 98,
        100, 103, 104, 107, 109, 110, 112, 115, 117, 118,
        121, 122, 124, 127, 128, 131, 133, 134, 137, 138,
        140, 143, 145, 146, 148, 151, 152, 155, 157, 158,
        161, 162, 164, 167, 168, 171, 173, 174, 176, 179,
        181, 182, 185, 186, 188, 191, 193, 194, 196, 199,
        200, 203, 205, 206, 208, 211, 213, 214, 217, 218,
        220, 223, 224, 227, 229, 230, 233, 234, 236, 239,
        241, 242, 244, 247, 248, 251, 253, 254,
    ];

    var desWeakKeys = {
        "0101010101010101": 1,
        "fefefefefefefefe": 1,
        "e0e0e0e0f1f1f1f1": 1,
        "1f1f1f1f0e0e0e0e": 1,
        "011f011f010e010e": 1,
        "1f011f010e010e01": 1,
        "01e001e001f101f1": 1,
        "e001e001f101f101": 1,
        "01fe01fe01fe01fe": 1,
        "fe01fe01fe01fe01": 1,
        "1fe01fe00ef10ef1": 1,
        "e01fe01ff10ef10e": 1,
        "1ffe1ffe0efe0efe": 1,
        "fe1ffe1ffe0efe0e": 1,
        "e0fee0fef1fef1fe": 1,
        "fee0fee0fef1fef1": 1
    };

    function mit_des_string_to_key(password, salt) {
        function removeMSBits(block) {
            // Clears the MSB of each octet. Now we have a 8 octets, but
            // the MSB of each is uninteresting.
            for (var i = 0; i < block.words.length; i++) {
                block.words[i] = block.words[i] & 0x7f7f7f7f;
            }
        }

        function reverse56Bits(block) {
            block.words.reverse();
            for (var i = 0; i < block.words.length; i++) {
                var word = block.words[i];
                // Just reverse bytes by lookup table.
                word = ((sevenBitReverseTable[word & 0xff] << 24) |
                        (sevenBitReverseTable[(word >>> 8) & 0xff] << 16) |
                        (sevenBitReverseTable[(word >>> 16) & 0xff] << 8) |
                        (sevenBitReverseTable[(word >>> 24) & 0xff]));
                block.words[i] = word;
            }
        }

        function add_parity_bits(block) {
            for (var i = 0; i < block.words.length; i++) {
                var word = block.words[i];
                word = ((desParityBitTable[word & 0xff]) |
                        (desParityBitTable[(word >>> 8) & 0xff] << 8) |
                        (desParityBitTable[(word >>> 16) & 0xff] << 16) |
                        (desParityBitTable[(word >>> 24) & 0xff] << 24));
                block.words[i] = word;
            }
        }

        function shift_bits(block) {
            for (var i = 0; i < block.words.length; i++) {
                var word = block.words[i];
                word = word >> 1;
                block.words[i] = word;
            }
        }

        function key_correction(block) {
            var hex = CryptoJS.enc.Hex.stringify(block);
            if (hex in desWeakKeys) {
                block.words[1] = block.words[1] ^ 0xf0;
            }
        }

        // "parse" is a funny name. Apparently the input here is
        // JavaScript (UTF-16) string interpreted as UTF-8.
        var passwordUtf8 = CryptoJS.enc.Utf8.parse(password);
        var saltUtf8 = CryptoJS.enc.Utf8.parse(salt);

        var s = passwordUtf8.clone();
        s.concat(saltUtf8);

        // Pad NULs to 8-byte boundary.
        var remainder = 8 - (s.sigBytes % 8);
        if (remainder == 8) remainder = 0;
        if (remainder > 4) {
            s.concat(CryptoJS.lib.WordArray.create([0, 0], remainder));
        } else if (remainder > 0) {
            s.concat(CryptoJS.lib.WordArray.create([0], remainder));
        }

        var tempString = CryptoJS.lib.WordArray.create([0, 0]);

        // For each 8-byte-block in s...
        var odd = false;
        for (var i = 0; i < s.sigBytes; i += 8) {
            var word1 = s.words[i >> 2];
            var word2 = s.words[(i >> 2) + 1];
            var block = CryptoJS.lib.WordArray.create([word1, word2]);
            removeMSBits(block);
            if (odd) {
                reverse56Bits(block);
            }
            odd = !odd;

            // XOR block into tempString
            for (var j = 0; j < 2; j++) {
                tempString.words[j] = tempString.words[j] ^ block.words[j];
            }
        }
        add_parity_bits(tempString);
        key_correction(tempString);
        var enc = CryptoJS.DES.encrypt(s, tempString,
                                       { iv: tempString,
                                         padding: CryptoJS.pad.NoPadding });
        // We want the DES-CBC checksum, which is the last hunk of
        // ciphertext.
        var keyWord1 = enc.ciphertext.words[enc.ciphertext.words.length - 2];
        var keyWord2 = enc.ciphertext.words[enc.ciphertext.words.length - 1];
        // Remove the last bit and align for parity bits.
        var key = CryptoJS.lib.WordArray.create(
            [(keyWord1 & 0xfefefefe) >>> 1, (keyWord2 & 0xfefefefe) >>> 1]);
        add_parity_bits(key);
        key_correction(key);
        // These guys get serialized to/from ASN.1, so we need to end with
        // strings.

        // TODO: Add functions to the encryption profile to convert
        // between a key's OCTET STRING form and the native one. This is a
        // little silly.
        return CryptoJS.enc.Latin1.stringify(key);
    };

    function des_string_to_key(password, salt, params) {
        if (params === undefined) params = "";

        var type;
        if (params.length == 0) {
            type = 0;
        } else if (params.length == 1) {
            type = params.charCodeAt(0);
        } else {
            throw new kcrypto.InvalidParameters("Bad string-to-key parameter");
        }

        if (type == 0) {
            return mit_des_string_to_key(password, salt);
        } else {
            throw new kcrypto.InvalidParameters("Bad DES string-to-key type");
        }
    };

    function makeDesEncryptionProfile(checksumProfile) {
        // Note: checksumProfile is the checksum for encrypting with DES,
        // not the required checksum.
        if (checksumProfile.checksumBytes % 4 != 0)
            throw 'Checksum not an integer number of words';
        var checksumWords = checksumProfile.checksumBytes / 4;

        var profile = {};
        profile.stringToKey = des_string_to_key;
        profile.deriveKey = function (key, usage) {
            return key;
        };
        // profile.initialCipherState varies.
        profile.decrypt = function (key, state, data) {
            key = CryptoJS.enc.Latin1.parse(key);
            state = CryptoJS.enc.Latin1.parse(state);

            // data is a String where only the last byte matters.
            data = CryptoJS.enc.Latin1.parse(data);
            var cipherParams = CryptoJS.lib.CipherParams.create({
                ciphertext: data
            });

            var decrypted = CryptoJS.DES.decrypt(
                cipherParams, key, { iv: state, padding: CryptoJS.pad.NoPadding });
            if (decrypted.sigBytes < 12)
                throw new kcrypto.DecryptionError('Bad format');

            // First 2 words (8 bytes) are the confounder.

            // Next checksumWords words are a checksum.
            var checksum = CryptoJS.lib.WordArray.create(
                decrypted.words.slice(2, 2 + checksumWords));

            // Rest are the message (plus padding).
            var message = CryptoJS.lib.WordArray.create(
                decrypted.words.slice(2 + checksumWords),
                decrypted.sigBytes - 12);

            // Check the checksum.
            var checksumData = decrypted.clone();
            for (var i = 0; i < checksumWords; i++) {
                checksumData.words[2 + i] = 0;
            }
            if (!checksumProfile.verifyMic(
                key, CryptoJS.enc.Latin1.stringify(checksumData),
                CryptoJS.enc.Latin1.stringify(checksum)))
                throw new kcrypto.DecryptionError('Checksum mismatch!');

            // New cipher state is the last block of the ciphertext.
            state = CryptoJS.lib.WordArray.create(
                [data.words[data.words.length - 2],
                 data.words[data.words.length - 1]]);
            return [
                CryptoJS.enc.Latin1.stringify(state),
                CryptoJS.enc.Latin1.stringify(message)
            ];
        };
        profile.encrypt = function (key, state, data) {
            key = CryptoJS.enc.Latin1.parse(key);
            state = CryptoJS.enc.Latin1.parse(state);

            // First, add a confounder and space for the checksum.
            var words = sjcl.random.randomWords(2);
            for (var i = 0; i < checksumWords; i++) {
                words.push(0);
            }

            var plaintext = CryptoJS.lib.WordArray.create(words);
            // Now the message. It's our usual String-as-byte-array.
            plaintext.concat(CryptoJS.enc.Latin1.parse(data));

            // Pad with random gunk to 8 octets.
            var remainder = 8 - (plaintext.sigBytes % 8);
            if (remainder == 8)
                remainder = 0;
            var remainderWords = remainder + 3;
            remainderWords -= (remainderWords % 4);
            remainderWords /= 4;
            plaintext.concat(CryptoJS.lib.WordArray.create(
                sjcl.random.randomWords(remainderWords),
                remainder));

            // Compute a checksum of the message, and stick it in the
            // plaintext.
            // FIXME: This converts between string and WordArray a
            // lot. Perhaps we should just standardize on the latter, much
            // of a pain as it is to use sometimes.
            var cksum = CryptoJS.enc.Latin1.parse(
                checksumProfile.getMic(
                    key, CryptoJS.enc.Latin1.stringify(plaintext)));
            for (var i = 0; i < checksumWords; i++) {
                plaintext.words[2 + i] = cksum.words[i];
            }

            // Finally, encrypt the checksummed plaintext.
            var encrypted = CryptoJS.DES.encrypt(
                plaintext, key, { iv: state, padding: CryptoJS.pad.NoPadding });

            // New cipher state is the last block of the ciphertext.
            state = CryptoJS.lib.WordArray.create(
                [encrypted.ciphertext[encrypted.ciphertext.words.length - 2],
                 encrypted.ciphertext[encrypted.ciphertext.words.length - 1]]);
            return [
                CryptoJS.enc.Latin1.stringify(state),
                CryptoJS.enc.Latin1.stringify(encrypted.ciphertext)
            ];
        };
        return profile;
    };

    // 6.2.4.  RSA MD5 Cryptographic Checksum Using DES
    kcrypto.RsaMd5DesChecksum = {
        sumtype: kcrypto.sumtype.rsa_md5_des,
        checksumBytes: 24,
        getMic: function (key, msg) {
            // XOR key with 0xf0f0f0f0f0f0f0f0
            key = CryptoJS.enc.Latin1.parse(key);
            for (var i = 0; i < key.words.length; i++) {
                key.words[i] = key.words[i] ^ 0xf0f0f0f0;
            }
            // 8 octet confounder
            var conf = CryptoJS.lib.WordArray.create(sjcl.random.randomWords(2));

            // rsa-md5(conf | msg)
            var hashInput = conf.clone();
            hashInput.concat(CryptoJS.enc.Latin1.parse(msg));
            var hash = CryptoJS.MD5(hashInput);

            // And encrypt conf|hash with DES, IV of zero.
            conf.concat(hash);
            var iv = CryptoJS.lib.WordArray.create([0, 0]);

            return CryptoJS.enc.Latin1.stringify(
                CryptoJS.DES.encrypt(
                    conf, key, { iv: iv, padding: CryptoJS.pad.NoPadding }
                ).ciphertext);
        },
        verifyMic: function (key, msg, token) {
            // XOR key with 0xf0f0f0f0f0f0f0f0
            key = CryptoJS.enc.Latin1.parse(key);
            token = CryptoJS.enc.Latin1.parse(token);
            for (var i = 0; i < key.words.length; i++) {
                key.words[i] = key.words[i] ^ 0xf0f0f0f0;
            }

            // Decrypt.
            var iv = CryptoJS.lib.WordArray.create([0, 0]);
            var decrypted = CryptoJS.DES.decrypt(
                CryptoJS.lib.CipherParams.create({ ciphertext: token }),
                key, { iv: iv, padding: CryptoJS.pad.NoPadding });

            // Check the checksum.
            var hashIn = CryptoJS.lib.WordArray.create(decrypted.words.slice(0, 2));
            hashIn.concat(CryptoJS.enc.Latin1.parse(msg));
            var hash = CryptoJS.lib.WordArray.create(decrypted.slice(2));
            return hash.toString() == CryptoJS.MD5(hashIn).toString();
        }
    };

    // 6.2.1.  DES with MD5
    kcrypto.DesCbcMd5Profile = makeDesEncryptionProfile(kcrypto.RsaMd5Checksum);
    kcrypto.DesCbcMd5Profile.enctype = kcrypto.enctype.des_cbc_md5;
    kcrypto.DesCbcMd5Profile.initialCipherState = function (key, isEncrypt) {
        return "\0\0\0\0\0\0\0\0";
    };
    kcrypto.DesCbcMd5Profile.checksum = kcrypto.RsaMd5DesChecksum;

    // 6.2.3.  DES with CRC
    kcrypto.DesCbcCrcProfile = makeDesEncryptionProfile(kcrypto.Crc32Checksum);
    kcrypto.DesCbcCrcProfile.enctype = kcrypto.enctype.des_cbc_crc;
    kcrypto.DesCbcCrcProfile.initialCipherState = function (key, isEncrypt) {
        return key;
    };
    kcrypto.DesCbcCrcProfile.checksum = kcrypto.RsaMd5DesChecksum;

    // RFC 3962  Advanced Encryption Standard (AES) Encryption for Kerberos 5
    function aesStringToKey(pass, salt, param, profile) {
        if (param == undefined) param = "\x00\x00\x10\x00";
        if (param.length != 4)
            throw new kcrypto.InvalidParameters("Bad string-to-key parameter");
        // Parameter is iteration count.
        var iterCount = param.charCodeAt(0);
        iterCount *= 256;
        iterCount += param.charCodeAt(1);
        iterCount *= 256;
        iterCount += param.charCodeAt(2);
        iterCount *= 256;
        iterCount += param.charCodeAt(3);
        if (iterCount == 0)
            iterCount = 4294967296;
        // Pass SHA-1 instead of SHA-256 into hmac constructor.
        function sha1Hmac(pass) {
            sjcl.misc.hmac.call(this, pass, sjcl.hash.sha1);
        }
        sha1Hmac.prototype = sjcl.misc.hmac.prototype;
        var tkey = this.randomToKey(
            sjcl.codec.byteString.fromBits(
                sjcl.misc.pbkdf2(
                    sjcl.codec.utf8String.toBits(pass),
                    sjcl.codec.utf8String.toBits(salt),
                    iterCount, this.keyGenerationSeedLength, sha1Hmac)));
        return profile.DK(tkey, "kerberos");
    }
    function aesCtsEncrypt(key, state, plaintext) {
        var aes = new sjcl.cipher.aes(sjcl.codec.byteString.toBits(key));
        var stateBits = sjcl.codec.byteString.toBits(state);
        var plaintextBits = sjcl.codec.byteString.toBits(plaintext);
        if (plaintextBits.length <= 4) {
            // Can't do CBC-CTS. Just pad arbitrarily and encrypt
            // plain. Apparently you don't even xor the iv.
            pad128(plaintextBits);
            var outputStr = sjcl.codec.byteString.fromBits(
                aes.encrypt(plaintextBits));
            return [outputStr, outputStr];
        } else {
            var output = cbcCtsMode.encrypt(aes, plaintextBits, stateBits);
            // State is second-to-last chunk.
            var outLength = output.length;
            if (outLength % 4 != 0)
                outLength += 4 - (outLength % 4);
            var newState = output.slice(outLength - 8, outLength - 4);
            return [
                sjcl.codec.byteString.fromBits(newState),
                sjcl.codec.byteString.fromBits(output)
            ];
        }
    }
    function aesCtsDecrypt(key, state, ciphertext) {
        var aes = new sjcl.cipher.aes(sjcl.codec.byteString.toBits(key));
        var stateBits = sjcl.codec.byteString.toBits(state);
        var ciphertextBits = sjcl.codec.byteString.toBits(ciphertext);
        if (ciphertextBits.length <= 4) {
            if (sjcl.bitArray.bitLength(ciphertextBits) != 128)
                throw new kcrypto.DecryptionError("Bad length");
            try {
                var outputStr = sjcl.codec.byteString.fromBits(
                    aes.decrypt(ciphertextBits));
            } catch (e) {
                if (e instanceof sjcl.exception.corrupt)
                    throw new kcrypto.DecryptionError(e.message);
                throw e;
            }
            return [ciphertext, outputStr];
        } else {
            var output = cbcCtsMode.decrypt(aes, ciphertextBits, stateBits);
            // State is second-to-last chunk.
            var outLength = ciphertextBits.length;
            if (outLength % 4 != 0)
                outLength += 4 - (outLength % 4);
            var newState = ciphertextBits.slice(outLength - 8, outLength - 4);
            return [
                sjcl.codec.byteString.fromBits(newState),
                sjcl.codec.byteString.fromBits(output)
            ];
        }
    }
    kcrypto.aesCtsDecrypt = aesCtsDecrypt;
    function aesRandomToKey(x) { return x; }
    var aes128 = profilesFromSimpleProfile({
        enctype: kcrypto.enctype.aes128_cts_hmac_sha1_96,
        sumtype: kcrypto.sumtype.hmac_sha1_96_aes128,
        stringToKey: aesStringToKey,
        keyGenerationSeedLength: 128,
        randomToKey: aesRandomToKey,
        unkeyedHash: sjcl.hash.sha1,
        hmacOutputSize: 12,
        messageBlockSize: 1,
        encrypt: aesCtsEncrypt,
        decrypt: aesCtsDecrypt,
        cipherBlockSize: 16,
    });
    kcrypto.Aes128CtsHmacShaOne96 = aes128[0];
    kcrypto.ShaOne96Aes128Checksum = aes128[1];

    var aes256 = profilesFromSimpleProfile({
        enctype: kcrypto.enctype.aes256_cts_hmac_sha1_96,
        sumtype: kcrypto.sumtype.hmac_sha1_96_aes256,
        stringToKey: aesStringToKey,
        keyGenerationSeedLength: 256,
        randomToKey: aesRandomToKey,
        unkeyedHash: sjcl.hash.sha1,
        hmacOutputSize: 12,
        messageBlockSize: 1,
        encrypt: aesCtsEncrypt,
        decrypt: aesCtsDecrypt,
        cipherBlockSize: 16,
    });
    kcrypto.Aes256CtsHmacShaOne96 = aes256[0];
    kcrypto.ShaOne96Aes256Checksum = aes256[1];

    // The supported encryption types.
    kcrypto.encProfiles = { };
    kcrypto.encProfiles[kcrypto.DesCbcMd5Profile.enctype] =
        kcrypto.DesCbcMd5Profile;
    kcrypto.encProfiles[kcrypto.DesCbcCrcProfile.enctype] =
        kcrypto.DesCbcCrcProfile;
    kcrypto.encProfiles[kcrypto.Aes128CtsHmacShaOne96.enctype] =
        kcrypto.Aes128CtsHmacShaOne96;
    kcrypto.encProfiles[kcrypto.Aes256CtsHmacShaOne96.enctype] =
        kcrypto.Aes256CtsHmacShaOne96;

    kcrypto.sumProfiles = { };
    kcrypto.sumProfiles[kcrypto.RsaMd5Checksum.sumtype] =
        kcrypto.RsaMd5Checksum;
    kcrypto.sumProfiles[kcrypto.Crc32Checksum.sumtype] =
        kcrypto.Crc32Checksum;
    kcrypto.sumProfiles[kcrypto.ShaOne96Aes128Checksum.sumtype] =
        kcrypto.ShaOne96Aes128Checksum;
    kcrypto.sumProfiles[kcrypto.ShaOne96Aes256Checksum.sumtype] =
        kcrypto.ShaOne96Aes256Checksum;

    return kcrypto;
}());