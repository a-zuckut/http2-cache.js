var Dict = require("collections/dict"),
    Promise = require("bluebird");

//////////////////////////////////////////// Cache ////////////////////////////////////////////

function Cache() {
    // mapping from hash of request info to time ordered list or responses
    this._requestInfoToResponse = new Dict();
}

var cp = Cache.prototype;

cp.match = function (requestInfo/*, options*/) {
    var self = this;
    return new Promise(function (resolve/*, reject*/) {
        var response = null;
        var requestCacheDirectives = parseCacheControl(requestInfo.headers['cache-control']);
        if (requestCacheDirectives === null || !requestCacheDirectives['no-cache']) {
            var candidate = self._requestInfoToResponse.get(requestInfo.hash);
            if (candidate && satisfiesRequest(requestInfo, candidate) && !isExpired(candidate, new Date().getTime())) {
                response = candidate;
            }
        }
        resolve(response);
    });
};

function isExpired(response, currentTime) {
    return getExpireTime(response) < currentTime;
}

cp._expireOld = function () {
    var self = this;
    self._requestInfoToResponse.forEach(function (response, request) {
        var currentTime = new Date().getTime();
        if (isExpired(response, currentTime)) {
            if (self._debug) {
                console.log("Evicted Response from cache for: " + request);
            }
            self._requestInfoToResponse.delete(request);
        }
    });
};

function getExpireTime(response){
    var cacheControlHeaders = response.headers['cache-control'];
    var maxAgeAt = -1;
    var staleButRevalidateAt = -1;
    if (cacheControlHeaders) {
        var date = response.headers.date;
        if (!date) {
            // RFC error here, maybe we should ignore the request
            date = new Date().getTime();
        } else {
            date = new Date(date).getTime();
        }
        var dateInSeconds = date;
        var directives = parseCacheControl(cacheControlHeaders);
        if (directives['max-age']) {
            maxAgeAt = date + (directives['max-age'] * 1000);
        }
        if (directives['stale-while-revalidate']) {
            staleButRevalidateAt = dateInSeconds + (directives['stale-while-revalidate'] * 1000);
        }
    }
    return maxAgeAt > staleButRevalidateAt ? maxAgeAt : staleButRevalidateAt;
}

cp.put = function (requestInfo, response) {
    var self = this;
    return new Promise(function (resolve, reject) {
        if (!isCacheableResponse(response)) {
            reject(new TypeError("Not Cacheable response"));
        } else {
            if (self._debug) {
                console.log("Adding cache entry to :" + requestInfo.hash);
            }
            self._requestInfoToResponse.set(requestInfo.hash, response);
            resolve();
        }
    });
};

cp.setDebug = function (debug) {
    this._debug = debug;
};

//////////////////////////////////////////// Request Info ////////////////////////////////////////////


var RequestInfo = function (method, href, headers) {
    this.method = method;
    this.href = href;
    this.headers = headers;
    this.cacheDirectives = parseCacheControl(this.headers['cache-control']);

    this.hash = this.method + '^' + this.href;
};

// var rip = RequestInfo.prototype;

//////////////////////////////////////////// Parse Cache Control Utils ////////////////////////////////////////////

function satisfiesRequest(/*requestInfo, response*/) {
    // TODO
    return true;
}

function isCacheableResponse(response) {
    var cacheControlHeaders = response.headers['cache-control'];
    if (cacheControlHeaders) {
        var directives = parseCacheControl(cacheControlHeaders);
        if (directives['max-age']) {
            return true;
        } else if(directives['stale-while-revalidate']){
            return true;
        }
    }
    return false;
}

// https://github.com/roryf/parse-cache-control/blob/master/LICENSE
/*
 Cache-Control   = 1#cache-directive
 cache-directive = token [ "=" ( token / quoted-string ) ]
 token           = [^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+
 quoted-string   = "(?:[^"\\]|\\.)*"
*/
//                             1: directive                                        =   2: token                                              3: quoted-string
var PARSE_CACHE_CONTROL_REG = /(?:^|(?:\s*\,\s*))([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)(?:\=(?:([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)|(?:\"((?:[^"\\]|\\.)*)\")))?/g;
function parseCacheControl(field) {

    if (typeof field !== 'string') {
        return null;
    }

    var header = {};
    var error = field.replace(PARSE_CACHE_CONTROL_REG, function ($0, $1, $2, $3) {
        var value = $2 || $3;
        header[$1] = value ? value.toLowerCase() : true;
        return '';
    });

    if (header['max-age']) {
        try {
            var maxAge = parseInt(header['max-age'], 10);
            if (isNaN(maxAge)) {
                return null;
            }

            header['max-age'] = maxAge;
        }
        catch (err) {
        }
    }

    return (error ? null : header);
}

//////////////////////////////////////////// Exports ////////////////////////////////////////////
module.exports = {
    RequestInfo: RequestInfo,
    Cache: Cache,
    parseCacheControl: parseCacheControl,
    satisfiesRequest: satisfiesRequest,
    isCacheableResponse: isCacheableResponse,
};
