"use strict";

var IO = require("lazuli-io/index.js");
var Access = require("lazuli-access/index.js");


/**
* File processor for tracking changes between db stored files
*/
module.exports = IO.FileProcessorCSV.clone({
    id: "FileProcessorULF",
});


module.exports.defbind("resetCounters", "start", function () {
    this.sessions = {};
    if (this.session) {
        this.sessions[this.session.user_id] = this.session;
    }
    this.params = null;
    this.new_keys = [];
    this.counters = {
        page_saved: 0,
        page_error: 0,
        page_fail: 0,
    };
});


module.exports.override("processLine", function (line_values) {
    var values;
    if (line_values[0] === "P") {
        this.params = line_values;
    } else if (line_values[0] === "V") {
        if (!this.params) {
            this.throwError("No P row supplied before first V row at line " + this.line_nbr);
        }
        values = this.mapCSVLine(this.params, line_values);
        this.mapNewKeyValues(values);
        if (values.user_id && !this.sessions[values.user_id]) {
            this.sessions[values.user_id] = Access.Session.clone({ user_id: values.user_id, });
        }
        if (values.user_id && values.page_id) {
            this.new_keys[this.line_nbr] = this.execPage(this.sessions[values.user_id], values);
            this.debug("Setting {key:" + this.line_nbr + "} to " + this.new_keys[this.line_nbr]);
        }
    }
});


module.exports.define("mapCSVLine", function (params, line_values) {
    var values = {};
    var i;
    for (i = 0; i < params.length && i < line_values.length; i += 1) {
        if (params[i]) {            // must be non-blank
            values[params[i]] = line_values[i];
        }
    }
    return values;
});


module.exports.define("mapNewKeyValues", function (values) {
    var that = this;
    var new_key_match = /\{key:([0-9]*)\}/g;

    this.debug("new_keys: " + this.new_keys.toString());
    Object.keys(values).forEach(function (param) {
        var new_key_result = new_key_match.exec(values[param]);
        if (new_key_result) {
            that.debug("new_key_result: " + new_key_result.toString());
        }
        if (new_key_result && new_key_result.length >= 2) {
            if (!this.new_keys[parseInt(new_key_result[1], 10)]) {
                that.throwError("Key mapping not found for: " + new_key_result[1] + " at line " + this.line_nbr);
            }
            values[param] = values[param].replace(new_key_match,
                this.new_keys[parseInt(new_key_result[1], 10)]);
//                        values[param] = new_key_result[1] +  + new_key_result[3];
            that.debug("Replacing {key} in param " + param + ", to give: " + values[param]);
        }
    });
});


module.exports.define("execPage", function (session, values) {
    var page;
    var page_key = null;
    var visit_start_time = (new Date()).getTime().toFixed(0);

    try {
        page = session.getPage(values.page_id, values.page_key);
        page.getTrans().override_all_validations = this.override_all_validations; // C9475
        this.substituteCurrentPrimaryKey(page, values);

        if (values.page_button && values.page_button.indexOf("list_add_") === 0) {
            this.addGridRow(page, values);
        }
        page.update(values);
        if (page.active) {
            if (values.page_button === "save") {
                page.cancel();
                this.counters.page_error += 1;
            }
        } else if (page.trans) {
            if (page.trans.saved) {
                this.counters.page_saved += 1;
            } else {
                this.counters.page_error += 1;
            }
        }
    } catch (e) {
        this.report(e);
        this.counters.page_fail += 1;
        session.messages.report(e);
    }
    if (!page) {
        this.counters.page_fail += 1;
        session.messages.add({
            type: "E",
            text: "Session.getPage(" + values.page_id + ") returned null",
        });
    } else if (page.getPrimaryRow()) {
        page_key = page.getPrimaryRow().getKey();
    }
    session.updateVisit(page && page.trans, parseInt(visit_start_time, 10));
    session.messages.clear();
    return page_key;
});


module.exports.define("substituteCurrentPrimaryKey", function (page, values) {
    var curr_page_key;          // note: NOT necessarily the same as values.page_key
    var regex = /^(.*)\{curr_page_key\}(.*)$/;
    if (page.primary_row) {
        curr_page_key = page.primary_row.getKey();
    }
    if (curr_page_key) {
        Object.keys(values).forEach(function (param_id) {
            var match = regex.exec(values[param_id]);
            if (match && match.length > 2) {
                values[param_id] = match[1] + curr_page_key + match[2];
            }
            match = regex.exec(param_id);
            if (match && match.length > 2) {
                values[match[1] + curr_page_key + match[2]] = values[param_id];
                delete values[param_id];
            }
        });
    }
});


module.exports.define("addGridRow", function (page, values) {
    var section_id = values.page_button.substr(9);
    var section = page.sections.get(section_id);
    var new_row;
    if (!section) {
        this.throwError("unrecognized section id: " + section_id);
    }
    new_row = section.addNewRow(section.add_row_field, values["add_row_field_" + section.id]);
    delete values["add_row_field_" + section.id];
    delete values.page_button;
    Object.keys(values).forEach(function (param_id) {
        var match = param_id.match(/^\{grid_id\}(.*)$/);
        if (match && match.length > 1) {
            values[new_row.id_prefix + match[1]] = values[param_id];
            delete values[param_id];
        }
    });
});


module.exports.defbind("closeSessions", "end", function () {
    var that = this;
    Object.keys(this.sessions).forEach(function (session_id) {
        if (session_id !== this.session.id) {
            that.sessions[session_id].close();
        }
    });
});
