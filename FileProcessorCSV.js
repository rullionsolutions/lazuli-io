"use strict";

var IO = require("lazuli-io/index.js");


/**
* File processor for tracking changes between db stored files
*/
module.exports = IO.FileProcessor.clone({
    id: "FileProcessorCSV",
    columns: null,         // array of column heading strings - expected in line 1 if given
});


module.exports.override("readLine", function () {
    var line;
    var line_values = [];
    var in_quotes = false;
    var i;
    var chr;
    var current = "";

    do {
        line = this.reader.readLine();
        if (line === null) {    // EOF
            return null;
        }
        line = String(line);
//        line += "";        // convert to JS string
        if (in_quotes) {        // subsequent line
            current += "\n";
        }
        for (i = 0; i < line.length; i += 1) {
            chr = line.substr(i, 1);
            if (chr === "\"") {
                in_quotes = !in_quotes;
            } else if (chr === "," && !in_quotes) {
                line_values.push(current);
                current = "";
            } else {
                current += chr;
            }
        }
    } while (in_quotes);
    line_values.push(current);
    this.line_nbr += 1;
    return line_values;
});


module.exports.override("processLine", function (line_values) {
    // var str = this.line_nbr + ": ",
    //     i = 0,
    //     delim = "";

    this.info("Line: " + this.line_nbr + ", typeof line_values: " + typeof line_values + ", line_values.length: " + line_values.length);
    if (this.columns && this.line_nbr === 1) {
        this.checkColumnHeadings(line_values);
        // return;
    }
    // for (i = 0; i < line_values.length; i += 1) {
    //     str += delim + line_values[i];
    //     delim = ", ";
    // }
    // this.info(str);
});


module.exports.define("reportFieldSizes", function (line_values) {
    var i;
    for (i = 0; i < line_values.length; i += 1) {
        this.info(this.columns[i] + " ... " + line_values[i].length);
    }
});


/**
* To check if each string in the array returned from this.readCSVLine (passed as arg to this
* function)
* @param string array line_values
*/
module.exports.define("checkColumnHeadings", function (line_values) {
    var i;
    for (i = 0; i < this.columns.length; i += 1) {
        if (i >= line_values.length || this.columns[i] !== line_values[i]) {
            this.session.messages.add({
                type: "E",
                text: "Unexpected column heading: " + line_values[i] + "; was expecting: " + this.columns[i],
            });
        }
    }
});
