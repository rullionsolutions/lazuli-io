"use strict";

var IO = require("lazuli-io/index.js");


/**
* File processor for tracking changes between db stored files
*/
module.exports = IO.File.clone({
    id: "FileProcessor",
    batch_size: 10,
    stop_at_error: true,
});


module.exports.override("clone", function (spec) {
    return IO.File.clone.call(this, spec);
});


/**
* Prints a "Start" message and initialize the property amends to empty array
*/
module.exports.define("start", function () {
    this.debug("start");
});


/**
* Prints the list of session.messagesrelated to the processing with an "End" message
*/
module.exports.define("end", function () {
    this.debug("end");
    if (this.session) {
        this.info(this.session.messages.getString());
    }
});


/**
* Processes the file, using the stream returned by this.getReader(), line by line
* @param optional X.session. if not passed it use this.session
* @return integer this.line_nbr (total number of lines read)
*/
module.exports.define("process", function (session) {
    var line;
    var response;

    if (session) {
        this.session = session;
    }
    this.start();
    try {
        this.line_nbr = 0;
        this.reader = this.getReader();
        line = this.readLine();
        while (line !== null) {
            this.trace("Read line: " + this.line_nbr + " as: " + line);
            response = this.processLine(line);
            if (response === false) {
                this.warn("exiting due to processLine() returning false");
                break;
            }
            if (typeof this.line_limit === "number" && this.line_nbr > this.line_limit) {
                this.warn("exiting due to line_limit reached");
                break;
            }
            if (this.stop_at_error && this.session
                    && this.session.messages.error_recorded_since_clear) {
                this.throwError("stopping due to error");
            }
            line = this.readLine();
        }
    } catch (exc) {
        this.session.messages.add({
            type: "E",
            text: exc.toString(),
        });
        this.report(exc);
    }
    try {
        this.reader.close();
    } catch (ignore) {
        this.trace(ignore);
    }
    this.end();
    return this.line_nbr;
});


/**
* Reads a line from the open file; overridden in FileProcessorCSV to support split lines in quotes
* @return string line
*/
module.exports.define("readLine", function () {
    var line = this.reader.readLine();
    if (line !== null) {
        line = String(line);
        this.line_nbr += 1;
    }
    return line;
});


/**
* To be overridden. Is called on each line read in the process function
* @param string line
* @return optional boolean - false means stop processing
*/
module.exports.define("processLine", function (line) {
    this.info(this.line_nbr + ": " + line);
});


/**
* It executes one queued transaction only if the this.batch_size limit is not reached and the
* transaction isValid. For each call it calls the UpdateVisit in the session.
* @param boolean final_call
*/
module.exports.define("batchTrans", function (final_call) {
    var row_count;
    if (this.trans) {
        row_count = this.trans.getRowCount(true);            // modified row count
        if ((row_count >= this.batch_size) || final_call || !this.trans.isValid()) {
            this.session.updateVisit(this.visit_start_time);
            try {
                this.trans.save();
            } catch (e) {
                this.report(e);
                this.session.msg({
                    type: "E",
                    text: e.toString(),
                });
                this.trans.cancel();
            }
            this.trans = null;
        }
    }
});


/**
* It starts the batch transactions loop and initializes this.trans into the first call. It store in
* the session the starting time
*/
module.exports.define("batchTransLoop", function () {
    this.batchTrans(false);
    if (!this.trans) {
        this.trans = this.session.getNewTrans({
            page: this.page,
            allow_no_modifications: true,
            fully_identify_rows_in_messages: true,
        });
        this.visit_start_time = (new Date()).getTime();
        this.session.newVisit((this.page ? this.page.id : null),
            "module.exports.batchTransLoop() line " + this.line_nbr, null);
    }
});


/**
* Is called at the end of the performAmends function to do the last batchTrans op (identified by
* passing true to the batchTrans)
*/
module.exports.define("batchTransFinal", function () {
    this.batchTrans(true);
});


/**
* It adds one amend object to the amends array and it logs the add in the session.messages
* @param string action, string entity_id, string key, object map

module.exports.define("addAmend", function (action, entity_id, key, map) {
    this.amends.push({ action: action, entity_id: entity_id, key: key, map: map });
    this.session.messages.add({ type: 'I',
        text: "[" + action + "] " + entity_id + "[" + key + "] " + Parent.view.call(map) });
});


* @param object loaded_records, string entity_id, string id, object map, boolean allow_creates
module.exports.define("checkAmends", function (loaded_records, entity_id, id, map, allow_creates) {
    var data_obj,
        field_id,
        process = true,
        map_part;

    try {
        Entity.getEntity(entity_id).checkKey(id);
    } catch (e1) {
        this.session.messages.add({ type: 'W', text: "Invalid key: " + id + ", skipping" });
        return;
    }
    data_obj = loaded_records[id];

    for (field_id in map) {
        if (map.hasOwnProperty(field_id) && typeof map[field_id] !== "string") {
            this.session.messages.add({ type: 'E', text: "Invalid " + field_id + ": " +
                map[field_id] });
            process = false;
        }
    }
    if (!process) {
        return;
    }

    if (data_obj) {
 //       delete loaded_records[id];
        if (data_obj.processed) {
            this.session.messages.add({ type: 'W', text: "Duplicate line for id " + id +
                ", skipping" });
            return;
        }
        data_obj.processed = true;
        jslint nomen: true
        for (field_id in map) {
            if (map.hasOwnProperty(field_id) && map[field_id] !== data_obj[field_id]) {
                map_part = {};
                map_part[field_id] = map[field_id];
                this.addAmend("U", entity_id, data_obj._key, map_part);
            }
        }
   } else {
       loaded_records[id] = { processed: true };
       if (allow_creates) {
           this.addAmend("C", entity_id, null, map);
           loaded_records[id].created = true;
       }
   }
});


* It starts for each amend in the this.amends array the batchTransLoop
module.exports.define("performAmends", function () {
    var i,
        row,
        prop;

    for (i = 0; i < this.amends.length; i += 1) {
        if (this.stop_at_error && this.session.messages.error_recorded_since_clear) {
            if (this.trans) {
                this.trans.cancel();
            }
            this.throwError("stopping due to error");
        }
        this.batchTransLoop();
        if (this.amends[i].action === "C") {
            row = this.trans.createNewRow(this.amends[i].entity_id);
        } else {
            row = this.trans.getActiveRow(this.amends[i].entity_id, this.amends[i].key);
        }
        if (this.amends[i].action === "D") {
            row.setDelete(true);
        } else {
            for (prop in this.amends[i].map) {
                if (this.amends[i].map.hasOwnProperty(prop) && prop !== "_key") {
                    row.getField(prop).set(this.amends[i].map[prop]);
                }
            }
            if (!row.isValid()) {
                this.trans.removeRow(row);
            }
        }
    }
    this.batchTransFinal();
});


* It deactivates the amends that have not yet been processed and it adds a message in the
    session.messages for each deactivated amend
* @param object loaded_records, string entity_id
module.exports.define("deactivateRemaining", function (loaded_records, entity_id) {
    var id;

    for (id in loaded_records) {
        if (loaded_records.hasOwnProperty(id) && loaded_records[id].processed !== true) {
            this.addAmend("U", entity_id, id, { status: "I" });
            this.session.messages.add({ type: 'I', text: "No longer active: " + entity_id +
                " [" + id + "]" });
        }
    }
});


* It add a message in the session.messages containing the count of amends  not yet processed
* @param object loaded_records
module.exports.define("reportRemaining", function (loaded_records) {
    var id,
        count = 0;

    for (id in loaded_records) {
        if (loaded_records.hasOwnProperty(id) && loaded_records[id].processed !== true) {
    //        this.addAmend("D", "ad_cost_centre", id, {});
    //        this.addMessage("No longer in data set: " + id);
            count += 1;
        }
    }
    this.session.messages.add({ type: 'I', text: "Number no longer in data set: " + count });
});

*/
