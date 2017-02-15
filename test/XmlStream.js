/*jslint node: true */
"use strict";

var XmlStream = require("../XmlStream")
//  , Log       = require("../../base/Log")
  ;

//Log.level = Log.levels.debug;


module.exports.main = function (test) {
    var xmlstream = XmlStream.clone({ id: "div" }),
        elmt;

    test.expect(1);
    elmt = xmlstream.addChild("blah");
    elmt.attr("foo", "bar");
    elmt.text("sfgh");
    elmt.addChild("hoow");
    xmlstream.close();
    test.equal(xmlstream.out.collector, "<div><blah foo='bar'>sfgh<hoow/></blah></div>");
    test.done();
};

module.exports.errors = function (test) {
    var xmlstream = XmlStream.clone({ id: "div" }),
        elmt;

    test.expect(4);
    elmt = xmlstream.addChild("blah");
    test.throws(function () { xmlstream.attr("a", "b"); }, "set attr after child added");
    xmlstream.addChild("blah2");
    test.throws(function () { elmt.addChild("foo"); }, "add child after subsequent sibling added");
    test.throws(function () { elmt.text("sldjkfh"); }, "add text after subsequent sibling added");

    xmlstream.close();
    test.throws(function () { xmlstream.close(); }, "close() after already closed");

    test.done();
};