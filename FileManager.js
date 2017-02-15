/* global Packages */

"use strict";

var Core = require("lapis-core/index.js");
var SQL = require("lazuli-sql/index.js");


module.exports = Core.Base.clone({
    id: "FileManager",
    text_summary_length: 1000,
    antivirus_server: "10.12.1.74",  // rslvapp28
    antivirus_port: 5000,
    antivirus_timeout: 10,
});


module.exports.define("pipe", function (inStream, outStream) {
    var lSize = 0;
    var iRes = new Packages.java.lang.Long(0);
    var buffer = Packages.java.lang.reflect.Array.newInstance(Packages.java.lang.Byte.TYPE, 4096);
    while ((iRes = inStream.read(buffer)) !== -1) {     // eslint-disable-line no-cond-assign
        lSize += iRes;
        outStream.write(buffer, 0, iRes);
    }
    inStream.close();
    outStream.flush();
    return lSize;
});


module.exports.define("storeTextExtract", function (id, snippet, conn) {
    var result;
    var text_summary;
    var prepared_statement;

    if (!conn) {
        conn = SQL.Connection.getTransConnection("storeTextExtract");
    }

    this.debug(id);
    try {
        text_summary = this.getTextExtract(id, conn);

        if ((snippet !== false && (!snippet || snippet === true))
                && text_summary.length() > (this.text_summary_length - 10)) {
            text_summary = text_summary.substring(0, (this.text_summary_length - 10)) + "... (more)";
        }

        prepared_statement = conn.prepareStatement("UPDATE ac_file SET text_content=? WHERE _key = ?");
        prepared_statement.setString(1, text_summary);
        prepared_statement.setString(2, id);
        prepared_statement.executeUpdate();
        prepared_statement.clearParameters();

        this.debug("Ending StoreTextExtract on: " + id);
        return true;
    } catch (e) {
        e.javaException.printStackTrace();
        throw e;
    } finally {
        conn.finishedWithResultSet(result);
        conn.finishedWithPreparedStatement(prepared_statement);
    }
});


module.exports.define("getTextExtract", function (id, conn) {
    var inputStream;
    var result;
    var text;
    var content_type;
    var title;
    var tika = new Packages.org.apache.tika.Tika();
    var metadata;

    // tika.setMaxStringLength(this.text_summary_length);
    if (!conn) {
        conn = SQL.Connection.getTransConnection("getTextExtract");
    }

    this.debug(id);
    try {
        result = conn.executeQuery("SELECT title, content_type, content FROM ac_file WHERE _key = " + SQL.Connection.escape(id));
        if (result.next()) {
            title = SQL.Connection.getColumnString(result, 1);
            content_type = SQL.Connection.getColumnString(result, 2);
            inputStream = new Packages.java.io.BufferedInputStream(result.getBinaryStream(3));

            metadata = new Packages.org.apache.tika.metadata.Metadata();
            metadata.add(Packages.org.apache.tika.metadata.Metadata.RESOURCE_NAME_KEY, title);
            metadata.add(Packages.org.apache.tika.metadata.Metadata.CONTENT_TYPE, content_type);
            tika.detect(inputStream, metadata);

            text = tika.parseToString(inputStream);
            return text;
        }
    } catch (e) {
        e.javaException.printStackTrace();
        throw e;
    } finally {
        conn.finishedWithResultSet(result);
    }
    return null;
});


module.exports.define("getFormattedExtract", function (id, conn) {
    var inputStream;
    var result;
    var handler;
    var handler1;
    var prepared_statement;
    var factory;
    var tika = new Packages.org.apache.tika.Tika();
    var out;
    var text;

    if (!conn) {
        conn = SQL.Connection.getTransConnection("storeFormattedExtract");
    }

    this.debug(id);
    try {
        result = conn.executeQuery("SELECT title, content_type, content FROM ac_file WHERE _key = " + SQL.Connection.escape(id));
        if (result.next()) {
            inputStream = new Packages.java.io.BufferedInputStream(result.getBinaryStream(3));

            factory = Packages.javax.xml.transform.sax.SAXTransformerFactory.newInstance();
            handler = factory.newTransformerHandler();
            out = new Packages.java.io.ByteArrayOutputStream();

            handler.getTransformer().setOutputProperty(Packages.javax.xml.transform.OutputKeys.METHOD, "html");
            handler.getTransformer().setOutputProperty(Packages.javax.xml.transform.OutputKeys.INDENT, "yes");
            handler.getTransformer().setOutputProperty(Packages.javax.xml.transform.OutputKeys.ENCODING, "UTF-8");
            handler.setResult(new Packages.javax.xml.transform.stream.StreamResult(out));
            handler1 = new Packages.org.apache.tika.sax.ExpandedTitleContentHandler(handler);

            tika.getParser().parse(inputStream, handler1,
                new Packages.org.apache.tika.metadata.Metadata(),
                new Packages.org.apache.tika.parser.ParseContext()); // TODO
            text = new Packages.java.lang.String(out.toByteArray(), "UTF-8").replaceAll("\\n", "").replaceAll("\\r", "");

            this.debug("Ending getFormattedExtract on: " + id);
            return text;
        }
    } catch (e) {
        e.javaException.printStackTrace();
        throw e;
    } finally {
        conn.finishedWithResultSet(result);
        conn.finishedWithPreparedStatement(prepared_statement);
    }
    return null;
});


module.exports.define("virusScan", function (inputStream) {
    var socket = new Packages.java.net.Socket();
    var outputStream;
    var read;
    var buffer = [];
    var response;

    function parseResponse(response2) {
        if (response2.indexOf("stream: OK") !== -1) {
            return true;
        } else if (response2.indexOf("FOUND") !== -1) {
            this.info(response2);
            return false;
        }
        this.info(response2);
        return false;
    }

    try {
        socket.connect(new Packages.java.net.InetSocketAddress(this.antivirus_server,
            this.antivirus_port));
        socket.setSoTimeout(this.antivirus_timeout);
        outputStream = Packages.java.io.DataOutputStream(socket.getOutputStream());
        outputStream.write(Packages.java.lang.String("zINSTREAM\\0").getBytes(Packages.java.nio.charset.Charset.forName("UTF-8")));
        buffer = Packages.java.lang.reflect.Array.newInstance(Packages.java.lang.Byte.TYPE, 2048);
        while ((read = inputStream.read(buffer)) > 0) {     // eslint-disable-line no-cond-assign
            outputStream.writeInt(read);
            outputStream.write(buffer, 0, read);
        }
        outputStream.writeInt(0);
        outputStream.flush();

        read = socket.getInputStream().read(buffer);
        if (read > 0) {
            response = String(new Packages.java.lang.String(buffer, 0, read));
        }
        return parseResponse(response);
    } catch (e) {
        this.report(e);
    } finally {
        if (outputStream !== null) {
            try {
                outputStream.close();
            } catch (outStreamError) {
                this.debug(outStreamError);
            }
        }
        try {
            socket.close();
        } catch (socketError) {
            this.debug(socketError);
        }
    }
    return null;
});
