/* global Packages, JavaAdapter */

"use strict";

var Core = require("lapis-core/index.js");


/**
* Provides the basic functions to handle http requests even through the proxy if any.
*/
module.exports = Core.Base.clone({
    id: "HttpClient",
    protocol: "https",
    domain: "ssl.rullionsolutions.com",
    method: "GET",
    use_caches: false,
    read_timeout: 10000,            // 10 * 1000 ms
    request_headers: {              // TODO use an OrderedMap?
        "User-Agent": "RSL HTTP client script - x.HttpClient",
    },
});


/**
* To compose a string url from constituent elements (properties of this object): url OR protocol
* @return string url
*/
module.exports.define("getURL", function () {
    return this.url || this.protocol + "://" + (this.server ? this.server + "." : "") + this.domain +
        (this.port ? ":" + this.port : "") + "/" + (this.path || "") +
        (this.query_string ? "?" + this.query_string : "") +
        (this.fragment_id ? "#" + this.fragment_id : "");
});


/**
* To authenticate a proxy connection using userid and password supplied
* @param userid (string) and password (string)
*/
module.exports.define("authenticate", function (userid, password) {
    Packages.rsl.ProxyAuthenticator.use(userid, password);
});


/**
* To check if the proxy properties are defined
* @return Boolean
*/
module.exports.define("isProxyDefined", function () {
    return !!this.outgoing_proxy_host;
});


/**
* It creates and returns a java.net.URL obj, using the url returned from getURL(), to use in the
* getconnection function or in custom function like execSoap
* @return java.net.URL Object
*/
module.exports.define("getURLObject", function () {
    var url = this.getURL();
    return new Packages.java.net.URL(url);
});


/**
* It creates and returns a java.net.URL obj, using the url returned from getURL(), to use in the
* getconnection function or in custom function like execSoap
* @param java.net.URL object
* @return java.net.Proxy Object. if no proxy props are set the same input Object is returned.
*/
module.exports.define("getProxiedURLObject", function (java_url_object) {
    var java_url_stream_handler;
    var that = this;

    function customOpenConnection(java_url_obj) {
        var java_url_object_clone = new Packages.java.net.URL(that.getURL());
        var java_proxy_object = that.getProxyObject();
        var java_url_conn_object = java_url_object_clone.openConnection(java_proxy_object);
        return java_url_conn_object;
    }

    if (this.isProxyDefined()) {
        // This line is specific for rhino. It overwrites the function OpenConnection of the
        // URLStreamHandler class during instantiation.
        java_url_stream_handler = new JavaAdapter(Packages.java.net.URLStreamHandler,
            { openConnection: customOpenConnection, });
        java_url_object = new Packages.java.net.URL(java_url_object, this.getURL(),
            java_url_stream_handler);
    }

    return java_url_object;
});


/**
* To get connection from a URL Object created from getURLObject function
* @return java.net.URLConnection Object
*/
module.exports.define("getConnection", function () {
    var java_url_conn_object = null;
    var java_url_object = this.getURLObject();

    if (this.isProxyDefined()) {
        java_url_conn_object = java_url_object.openConnection(this.getProxyObject());
    } else {
        java_url_conn_object = java_url_object.openConnection();
    }
    return java_url_conn_object;
});


/**
* To get a java.net.Proxy object using type, host and port provided through the properties:
* outgoing_proxy_type, outgoing_proxy_port and outgoing_proxy_host.
* @return java.net.Proxy Object
*/
module.exports.define("getProxyObject", function () {
    var proxy_type;
    var java_proxy_object = null;
    var java_inet_sock_addr;

    if (this.isProxyDefined()) {
        // default if not provided
        proxy_type = this.outgoing_proxy_type || "HTTP";
        java_inet_sock_addr = new Packages.java.net.InetSocketAddress(this.outgoing_proxy_host,
            this.outgoing_proxy_port);
        java_proxy_object = new Packages.java.net.Proxy(Packages.java.net.Proxy.Type[proxy_type],
            java_inet_sock_addr);
    }
    return java_proxy_object;
});


module.exports.define("applyAuthHeaders", function () {
    var BASE64Encoder = Packages.sun.misc.BASE64Encoder;
    var auth_credentials = this.auth_username + ":" + this.auth_password;
    var auth_credentials_base64 = new BASE64Encoder()
      .encode(new Packages.java.lang.String(auth_credentials).getBytes())
      .replaceAll("\n", "");
    // !Important! - Get rid of any newline characters erroneously added by the Base64Encoder

    this.request_headers = this.request_headers || {};
    this.request_headers.Authorization = "Basic " + auth_credentials_base64;
});


// uses properties: url, method, payload, use_caches, read_timeout
/**
* To open a connection using getConnection(), set settings, add headers, send payload, and ...
* @return this.response object containing: headers, body, code, msg and start date
*/
module.exports.define("exec", function () {
    var connection;

    if (this.method === "SOAP") {
        return this.execSoap();
    }
    this.response = {
        start: new Date(),
    };
    try {
        connection = this.getConnection();
        if (typeof this.use_caches === "boolean") {
            connection.setUseCaches(this.use_caches);
        }
        if (typeof this.read_timeout === "number") {
            connection.setReadTimeout(this.read_timeout);
        }
        connection.setDoOutput(true);
        connection.setRequestMethod(this.method);
        if (typeof this.auth_username === "string"
                && typeof this.auth_password === "string") {
            this.applyAuthHeaders();
        }
        this.applyRequestHeaders(connection);
        if (this.payload) {
            this.outputPayload(connection);
        }
        this.response.headers = this.collectResponseHeaders(connection);
        this.response.code = Number(connection.getResponseCode());
        this.response.body = this.collectResponseBody(connection);
        this.response.msg = String(connection.getResponseMessage());
        this.debug(this.getURL() + " " + this.response.msg);
    } catch (e) {
        this.response.msg = e.toString();
        this.error(this.getURL() + " " + this.response.msg);
    }

    this.response.end = new Date();
    return this.response;
});


module.exports.define("getBufferedReader", function (input_stream) {
    var input_stream_reader = null;
    var buffered_reader = null;

    input_stream_reader = input_stream && new Packages.java.io.InputStreamReader(input_stream);
    buffered_reader = input_stream_reader
        && new Packages.java.io.BufferedReader(input_stream_reader);
    return buffered_reader;
});


/**
* To make on soap send/receive exchange using an xml string as payload and an xml string as
* response.
* @return this.response object containing: headers, body (xml string response), code (200 if
* no error come, otherwise 400), msg and start date
*/
module.exports.define("execSoap", function () {
    var proxied_url_obj;
    var soap_mess_factory;
    var soap_conn_factory;
    var soap_conn;
    var soap_payload;
    var soap_mess;
    var soap_resp;
    var soap_mime_headers;

    if (!this.url || !this.payload) {
        this.throwError("execSoap() requires url, payload");
    }

    this.response = { start: new Date(), };

    try {
        // get the javas objs factory instances
        proxied_url_obj = this.getProxiedURLObject(this.getURLObject());
        soap_payload = new Packages.java.io.ByteArrayInputStream(
            new Packages.java.lang.String(this.payload).getBytes(Packages.java.nio.charset.Charset.forName("UTF-8")));
        soap_mess_factory = Packages.javax.xml.soap.MessageFactory.newInstance();
        soap_conn_factory = Packages.javax.xml.soap.SOAPConnectionFactory.newInstance();
        soap_mime_headers = new Packages.javax.xml.soap.MimeHeaders();
        this.applySoapRequestHeaders(soap_mime_headers);
        // build the req message
        soap_mess = soap_mess_factory.createMessage(soap_mime_headers, soap_payload);
        // debug the generated soap xml from the original

        this.debug("SOAP Sent Message XML: " + this.getSOAPMessageAsString(soap_mess));
        // do the exchange
        soap_conn = soap_conn_factory.createConnection();
        soap_resp = soap_conn.call(soap_mess, proxied_url_obj);
        // collect data
        this.response.headers = this.collectSoapResponseHeaders(soap_resp);
// this.response.code = soap_resp.getSOAPPart().getEnvelope().getBody().getFault().getFaultCode();
        this.response.body = this.getSOAPMessageAsString(soap_resp);

        this.debug("SOAP Resp Message XML: " + this.response.body);
        // close Soap connection
        soap_conn.close();
        // set the positive status msg as java string for equality with the normal exec()
        this.response.code = "200";
        this.response.msg = "OK";
    } catch (e) {
        this.response.msg = e.toString();
        this.debug(e);
        this.response.code = "400";
    }

    return this.response;
});


/**
* To stringfy an javax.xml.soap.SOAPMessage object to xml
* @param javax.xml.soap.SOAPMessage, pretty_print(optional. it enables a very simple pretty print
* on the returning xml)
* @return string xml
*/
module.exports.define("getSOAPMessageAsString", function (message, pretty_print) {
    var soap_resp_baos = null;
    var resp_str = "";
    try {
        soap_resp_baos = new Packages.java.io.ByteArrayOutputStream();
        message.writeTo(soap_resp_baos);
        resp_str = String(soap_resp_baos.toString());
    } catch (e) {
        e.printStackTrace();
    }

    if (pretty_print) {
        resp_str = resp_str.replace(new RegExp(">", "g"), ">\n");
    }

    return resp_str;
});


/**
* To iterate over the request_headers property, adding each name/value pair as a request header
* (property?)
* @param connection object
*/
module.exports.define("applyRequestHeaders", function (connection) {
    var that = this;
    Object.keys(this.request_headers).forEach(function (i) {
        connection.setRequestProperty(i, that.request_headers[i]);
    });
});


module.exports.define("applySoapRequestHeaders", function (soap_mime_headers) {
    var that = this;
    Object.keys(this.request_headers).forEach(function (i) {
        soap_mime_headers.addHeader(i, that.request_headers[i]);
    });
});


/**
* To stream the string value of the payload property to the output stream of the connection
* @param connection object
*/
module.exports.define("outputPayload", function (connection) {
    var print_stream = new Packages.java.io.PrintStream(connection.getOutputStream());
    print_stream.println(this.payload);
    print_stream.close();
});


/**
* To stringfy the received or the input header Object map. it adds a new line between each
* header key/value pair.
* @param Optional headers object.
* @return String headers
*/
module.exports.define("getStringifiedHeaders", function (headers) {
    var out = "";
    var delim = "";

    Object.keys(headers).forEach(function (header_id) {
        out += delim + (header_id ? header_id + ": " : "") + headers[header_id];
        delim = "\n";
    });
    return out;
});


/**
* To collect the connection response headers into an object map of name/value pairs
* @param connection object
* @return object map of name/value pairs
*/
module.exports.define("collectResponseHeaders", function (connection) {
    var header;
    var line;
    var i;
    var response_headers = {};
    var headers = connection.getHeaderFields().entrySet().iterator();
    while (headers.hasNext()) {
        header = headers.next();
        line = "";
        for (i = 0; i < header.getValue().size(); i += 1) {
            line += (i > 0 ? ", " : "") + header.getValue().get(i);
        }
        response_headers[String(header.getKey() || "")] = line;
    }
    return response_headers;
});


module.exports.define("collectSoapResponseHeaders", function (soap_response) {
    var soap_headers = soap_response.getMimeHeaders().getAllHeaders();
    var soap_header;
    var response_headers = {};

    while (soap_headers.hasNext()) {
        soap_header = soap_headers.next();
        response_headers[String(soap_header.getName() || "")] = String(soap_header.getValue());
    }
    return response_headers;
});


module.exports.define("readContentFromStream", function (input_reader) {
    var response_body = "";
    var line;

    if (input_reader) {
        line = input_reader.readLine();

        while (line) {
            response_body += "\n" + line;
            line = input_reader.readLine();
        }
    }
    return response_body;
});


/**
* To collect the response payload into a single string and return it
* @param connection object
* @return String response
*/
module.exports.define("collectResponseBody", function (connection) {
    var input_reader;
    var response_body = "";

    try {
        input_reader = this.getBufferedReader(connection.getErrorStream());
        response_body = this.readContentFromStream(input_reader);
    } catch (e_err) {
        this.debug("err stream exception: " + e_err.toString());
    }

    if (response_body) {
        response_body += "\n\n\n";
    }
    try {
        input_reader = this.getBufferedReader(connection.getInputStream());
        response_body += this.readContentFromStream(input_reader);
    } catch (e_in) {
        this.debug("in stream exception: " + e_in.toString());
    }

    return response_body;
});


/**
* To call exec() and print the response code, msg, headers, body and total time
*/
module.exports.define("show", function () {
    var header_text = "";
    var response = this.exec();
    Object.keys(response.headers).forEach(function (header_id) {
        header_text += "\n" + header_id + " = " + response.headers[header_id];
    });
    this.info("Response code: " + response.code);
    this.info("Response msg : " + response.msg);
    this.info("Response head: " + header_text);
    this.info("Response body: " + response.body);
    this.info("Response time: " + (response.end.getTime() - response.start.getTime()));
});


/**
* To loop 'times', then loop over 'sites' calling blastOnce(), then sleep for 'delay' ms
*/
module.exports.define("blast", function () {
    var i;
    var j;
    var times = this.times || 10;
    var delay = this.delay || 1000;        // ms

    for (i = 0; i < times; i += 1) {
        if (this.sites) {
            for (j = 0; j < this.sites.length; j += 1) {
                this.clone(this.sites[j]).blastOnce();
            }
        } else {
            this.blastOnce();
        }
        Packages.java.lang.Thread.currentThread().sleep(delay);
    }
});


/**
* To call exec() and then print the url, response code, RSL-Ident header, and total time
*/
module.exports.define("blastOnce", function () {
    var response = this.exec();
    this.info(this.getURL() + " ~ " + response.code + " from " + response.headers["RSL-Ident"] +
        " in " + (response.end.getTime() - response.start.getTime()) + "ms");
});


module.exports.define("rsl_sites", [
    { path: "anmd_prod/guest/", },
    { path: "annv_prod/guest/", },
    { path: "bail_prod/guest/", },
    { path: "ccfe_prod/guest/", },
    { path: "coop_prod/guest/", },
    { path: "hnsn_prod/guest/", },
    { path: "nesl_prod/guest/", },
    { path: "rulg_prod/guest/", },
    { path: "smns_prod/guest/", },
    { path: "uplc_prod/guest/", },
]);
