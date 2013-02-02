/*
 WinChan is Copyright (c) 2012 Lloyd Hilaiel
 https://github.com/lloyd/winchan */
'use strict';var WinChan=function(){function e(a,f,b){a.attachEvent?a.attachEvent("on"+f,b):a.addEventListener&&a.addEventListener(f,b,!1)}function b(a,b,c){a.detachEvent?a.detachEvent("on"+b,c):a.removeEventListener&&a.removeEventListener(b,c,!1)}function c(a){/^https?:\/\//.test(a)||(a=window.location.href);var b=/^(https?:\/\/[\-_a-zA-Z\.0-9:]+)/.exec(a);return b?b[1]:a}var d="die",h,g=-1;"Microsoft Internet Explorer"===navigator.appName&&null!=/MSIE ([0-9]{1,}[.0-9]{0,})/.exec(navigator.userAgent)&&
(g=parseFloat(RegExp.$1));h=8<=g;return window.JSON&&window.JSON.stringify&&window.JSON.parse&&window.postMessage?{open:function(a,f){function g(){j&&document.body.removeChild(j);j=void 0;if(q)try{q.close()}catch(a){k.postMessage(d,t)}q=k=void 0}function l(a){try{var c=JSON.parse(a.data);"ready"===c.a?k.postMessage(u,t):"error"===c.a?f&&(f(c.d),f=null):"response"===c.a&&(b(window,"message",l),b(window,"unload",g),g(),f&&(f(null,c.d),f=null))}catch(d){}}if(!f)throw"missing required callback argument";
var m;a.url||(m="missing required 'url' parameter");a.relay_url||(m="missing required 'relay_url' parameter");m&&setTimeout(function(){f(m)},0);a.window_name||(a.window_name=null);var n;if(!(n=!a.window_features))a:{try{var p=navigator.userAgent;n=-1!=p.indexOf("Fennec/")||-1!=p.indexOf("Firefox/")&&-1!=p.indexOf("Android");break a}catch(r){}n=!1}n&&(a.window_features=void 0);var j,t=c(a.url);if(t!==c(a.relay_url))return setTimeout(function(){f("invalid arguments: origin of url and relay_url must match")},
0);var k;h&&(j=document.createElement("iframe"),j.setAttribute("src",a.relay_url),j.style.display="none",j.setAttribute("name","__winchan_relay_frame"),document.body.appendChild(j),k=j.contentWindow);var q=window.open(a.url,a.window_name,a.window_features);k||(k=q);var u=JSON.stringify({a:"request",d:a.params});e(window,"unload",g);e(window,"message",l);return{close:g,focus:function(){if(q)try{q.focus()}catch(a){}}}},onOpen:function(a){function c(a){a=JSON.stringify(a);h?k.doPost(a,m):k.postMessage(a,
m)}function g(d){var e;try{e=JSON.parse(d.data)}catch(l){}e&&"request"===e.a&&(b(window,"message",g),m=d.origin,a&&setTimeout(function(){a(m,e.d,function(b){a=void 0;c({a:"response",d:b})})},0))}function l(a){if(a.data===d)try{window.close()}catch(c){}}var m="*",n;if(h)a:{for(var p=window.location,r=window.opener.frames,p=p.protocol+"//"+p.host,j=r.length-1;0<=j;j--)try{if(0===r[j].location.href.indexOf(p)&&"__winchan_relay_frame"===r[j].name){n=r[j];break a}}catch(t){}n=void 0}else n=window.opener;
var k=n;if(!k)throw"can't find relay frame";e(h?k:window,"message",g);e(h?k:window,"message",l);try{c({a:"ready"})}catch(q){e(k,"load",function(){c({a:"ready"})})}var u=function(){try{b(h?k:window,"message",l)}catch(d){}a&&c({a:"error",d:"client closed window"});a=void 0;try{window.close()}catch(e){}};e(window,"unload",u);return{detach:function(){b(window,"unload",u)}}}}:{open:function(a,c,b,d){setTimeout(function(){d("unsupported browser")},0)},onOpen:function(a){setTimeout(function(){a("unsupported browser")},
0)}}}();/*
 Copyright (c) 2013 David Benjamin and Alan Huang
 Use of this source code is governed by an MIT-style license that
 can be found at
 https://github.com/davidben/webathena
*/
function registerTicketAPI(){WinChan.onOpen(function(e,b,c){function d(){c({status:"DENIED",code:"NOT_ALLOWED"})}if(!b.realm||!b.principal)c({status:"ERROR",code:"BAD_REQUEST"});else if("https://"!=e.substring(0,8))d();else{var h=new krb.Principal({nameType:krb.KRB_NT_UNKNOWN,nameString:b.principal},b.realm);getTGTSession().then(function(b){var a=b[0];b=b[1];var f=$("#request-ticket-template").children().clone();f.appendTo(document.body);b&&f.fadeIn();f.find(".client-principal").text(a.client.toString());
f.find(".foreign-origin").text(e);f.find(".service-principal").text(h.toString());f.find(".request-ticket-deny").click(d);f.find(".request-ticket-allow").click(function(){localStorage.getItem("tgtSession")?a.isExpired()?(log("Ticket expired"),d()):a.getServiceSession(h).then(function(a){c({status:"OK",session:a.toDict()})},function(a){log(a);d()}).done():(log("No ticket"),d())})}).done()}})};sjcl.random.startCollectors();
function showLoginPrompt(){var e=Q.defer(),b=$("#login-template").children().clone();b.appendTo(document.body);b.find(".username").focus();b.submit(function(c){c.preventDefault();$("#alert").slideUp(100);var d=$(this).find(".username")[0];c=$(this).find(".password")[0];var h=d.value,d=c.value,g=!1;h?$(this).find(".username + .error").fadeOut():($(this).find(".username + .error").fadeIn(),g=!0);d?$(this).find(".password + .error").fadeOut():($(this).find(".password + .error").fadeIn(),g=!0);if(!g){c.value=
"";var a=$(this).find(".submit"),f=a.text();a.attr("disabled","disabled").text(".");var s=setInterval(function(){a.text((a.text()+".").replace(".....","."))},500),l=function(){clearInterval(s);a.attr("disabled",null).text(f)};c=krb.Principal.fromString(h);KDC.getTGTSession(c,d).then(function(a){l();b.fadeOut(function(){$(this).remove()});e.resolve(a)},function(a){a=a instanceof kcrypto.DecryptionError?"Incorrect password!":a instanceof KDC.Error?a.code==krb.KDC_ERR_C_PRINCIPAL_UNKNOWN?"User does not exist!":
a.code==krb.KDC_ERR_PREAUTH_FAILED||a.code==krb.KRB_AP_ERR_BAD_INTEGRITY?"Incorrect password!":a.message:String(a);$("#alert-title").text("Error logging in:");$("#alert-text").text(a);$("#alert").slideDown(100);l()}).done()}});return e.promise}
function showRenewPrompt(e){var b=Q.defer(),c=$("#renew-template").children().clone();c.find(".client-principal").text(e.client.toString());c.find(".logout-link").click(function(d){d.preventDefault();c.remove();b.resolve(showLoginPrompt())});c.appendTo(document.body);c.find(".password").focus();c.submit(function(d){d.preventDefault();$("#alert").slideUp(100);d=$(this).find(".password")[0];var h=d.value;if(h){$(this).find(".password + .error").fadeOut();d.value="";var g=$(this).find(".submit"),a=g.text();
g.attr("disabled","disabled").text(".");var f=setInterval(function(){g.text((g.text()+".").replace(".....","."))},500),s=function(){clearInterval(f);g.attr("disabled",null).text(a)};KDC.getTGTSession(e.client,h).then(function(a){s();c.fadeOut(function(){$(this).remove()});b.resolve(a)},function(a){a=a instanceof kcrypto.DecryptionError?"Incorrect password!":a instanceof KDC.Error?a.code==krb.KDC_ERR_C_PRINCIPAL_UNKNOWN?"User does not exist!":a.code==krb.KDC_ERR_PREAUTH_FAILED||a.code==krb.KRB_AP_ERR_BAD_INTEGRITY?
"Incorrect password!":a.message:String(a);$("#alert-title").text("Error logging in:");$("#alert-text").text(a);$("#alert").slideDown(100);s()}).done()}else $(this).find(".password + .error").fadeIn()});return b.promise}
function getTGTSession(){var e=localStorage.getItem("tgtSession");return e?(e=KDC.Session.fromDict(JSON.parse(e)),e.isExpired()?showRenewPrompt(e).then(function(b){localStorage.setItem("tgtSession",JSON.stringify(b.toDict()));return[b,!0]}):Q.resolve([e,!1])):showLoginPrompt().then(function(b){localStorage.setItem("tgtSession",JSON.stringify(b.toDict()));return[b,!0]})}
$(function(){function e(){getTGTSession().then(function(b){var c=b[0];b=b[1];log(c);var d=$("#authed-template").children().clone();d.appendTo(document.body);b&&d.fadeIn();d.find(".client-principal").text(c.client.toString());d.find("button.logout").click(function(){localStorage.removeItem("tgtSession");d.remove();e()})}).done()}$('<img src="eye-small.png">').css({left:78,top:12}).appendTo("#logo");$('<img src="eye-large.png">').css({left:87,top:16}).appendTo("#logo");$('<img src="eye-large.png">').css({left:105,
top:16}).appendTo("#logo");$('<img src="eye-small.png">').css({left:121,top:12}).appendTo("#logo");$(document).mousemove(function(b){$("#logo img").each(function(){var c=b.pageX-$(this).offset().left-$(this).width()/2,d=b.pageY-$(this).offset().top-$(this).height()/2,c="rotate("+Math.atan2(c,-d)+"rad)";$(this).css({transform:c,"-moz-transform":c,"-webkit-transform":c,"-ms-transform":c,"-o-transform":c})})});$("#whatis a").click(function(){$("#info").slideToggle(0).css("height",$("#info").height()).slideToggle(0).slideToggle();
return!1});"#!request_ticket_v1"==location.hash?registerTicketAPI():e()});
//@ sourceMappingURL=webathena-ui.js.map
