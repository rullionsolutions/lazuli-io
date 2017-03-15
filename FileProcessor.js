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


module.exports.register("start");
module.exports.register("end");


module.exports.override("clone", function (spec) {
    return IO.File.clone.call(this, spec);
});


/**
* Prints a "Start" message and initialize the property amends to empty array
*/
module.exports.define("start", function () {
    this.debug("start");
    this.happen("start");
});


/**
* Prints the list of session.messagesrelated to the processing with an "End" message
*/
module.exports.define("end", function () {
    this.debug("end");
    this.happen("end");
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
                    && this.session.messages.error_recorded) {
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
    this.reader = null;
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

