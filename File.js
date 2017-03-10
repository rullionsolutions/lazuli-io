/* global Packages, java */

"use strict";

var Core = require("lapis-core/index.js");
var Data = require("lazuli-data/index.js");


/**
* To represent a filesystem file and a library of filesystem commands
* most/all functions listed can be used staticly or as methods
* if cloned to represent a specicfic file, the clone id should be the file path
*/
module.exports = Core.Base.clone({
    id: "File",
    encoding: "UTF-8",
});


module.exports.define("isSpecificFile", function () {
    if (this.path && !this.java_file) {
        this.java_file = java.io.File(this.path);
    }
    return this !== module.exports && this.isDescendantOf(module.exports) && this.java_file;
});


module.exports.define("get", function (path) {
    return module.exports.clone({
        id: path,
        path: path,
    });
});


// static or dynamic
module.exports.define("getPath", function (path) {
    return path || (this.isSpecificFile() && this.path);
});


module.exports.define("getModulePath", function (module_arg) {
    var java_file = new java.io.File(new java.net.URL(module_arg.uri).getPath());
    return String(java_file.getParentFile().getParentFile().getCanonicalPath());
});


// static or dynamic
module.exports.define("getJavaFile", function (path) {
    if (this.isSpecificFile()) {
        return this.java_file;
    }
    return new java.io.File(path);
});


// static or dynamic
module.exports.define("getRelativePath", function (path) {
    path = (this.isSpecificFile() ? this.id : ".") + "/" + path;
    this.debug("getRelativePath() " + path);
    return String(this.getJavaFile(path).getCanonicalPath());
});


// static or dynamic
module.exports.define("getDirectory", function (path) {
    var index;
    path = this.getPath(path);
    index = path.lastIndexOf("/");
    return String(new java.io.File(path.substr(0, index)).getCanonicalPath());
});


module.exports.define("readFile", function (path) {
    var java_file = this.getJavaFile(path);
    var java_scanner = new java.util.Scanner(java_file, "UTF-8").useDelimiter("\\Z");
    var content = String(java_scanner.next());
    try {
        java_scanner.close();
    } catch (ignore) {
        this.trace(ignore);
    }
    return content;
});


/**
* To determine whether or not a file or directory exists at the given path (wrapper around
* java.io.File.exists())
* @param String path of file
* @return True if file/directory exists, otherwise false
*/
module.exports.define("exists", function (path) {
    return this.getJavaFile(path).exists();
});


/**
* To create a directory with a given path, creating parent directories as necessary
* @param String path of directory to create
*/
module.exports.define("mkdir", function (path) {
    var file = this.getJavaFile(path);
    if (!file.exists()) {
        file.mkdirs();            // Creates parent directories where necessary too
    }
});


/**
* To delete a given file or directory
* @param String path of file or directory to delete
*/
module.exports.define("del", function (path) {
    this.getJavaFile(path).delete();
});


/**
* To obtain the size in the bytes of the given file
* @param String path of file
* @return Size as a number of bytes
*/
module.exports.define("size", function (path) {
    return this.getJavaFile(path).length();
});


/**
* To copy a file from one place to another by stream bytes (not using a filesystem command)
* @param String path of file to copy from; string path of file to copy to
*/
module.exports.define("copy", function (to, from) {
    var instream;
    var outstream;

    from = this.getPath(from);
    if (!from || !this.exists(from)) {
        this.throwError("from file not found: " + from);
    }
    if (!to || !this.exists(to)) {
        this.throwError("to file not found: " + to);
    }
    instream = new java.io.BufferedInputStream(new java.io.FileInputStream(from));
    outstream = new java.io.BufferedOutputStream(new java.io.FileOutputStream(to));
    Packages.rsl.FileManager.pipe(instream, outstream);
    outstream.close();
});


module.exports.define("getReader", function () {
    if (!this.reader) {
        this.reader = new java.io.BufferedReader(
            new java.io.InputStreamReader(this.getInputStream(),
            this.encoding));
    }
    return this.reader;
});


module.exports.define("getInputStream", function () {
    if (this.file_id) {
        return Data.entities.get("ac_file").getRow(this.file_id).getInputStream();
    }
    if (!this.isSpecificFile()) {
        this.throwError("must be a specific file");
    }
    return new java.io.FileInputStream(this.getPath());
});


module.exports.define("close", function () {
    if (!this.isSpecificFile()) {
        this.throwError("must be a specific file");
    }
    return this.java_file.close();
});


/**
* To create a new zip file with the specified path
* @param String path of file
* @return An instance of java.util.zip.ZipOutputStream to which other files can be added using
* addFileToZip()
*/
module.exports.define("createZipFile", function (zipfile) {
    var out = module.exports.get(zipfile);
    out.zip_output_stream = new java.util.zip.ZipOutputStream(
        new java.io.FileOutputStream(out.java_file));
    return out;
});


/**
* To add a given file to a zip file
* @param The zipfile, as a java.util.zip.ZipOutputStream object (created using createZipFile()),
*string path to the file
*/
module.exports.define("addFileToZip", function (path, filename) {
    var instream;
    if (!this.isSpecificFile() || !this.zip_output_stream) {
        this.throwError("must be a specific file, created as a zip file");
    }
    this.info("Adding file to zip: " + path + " / " + filename);
    this.zip_output_stream.putNextEntry(new java.util.zip.ZipEntry(filename));
    instream = new java.io.BufferedInputStream(new java.io.FileInputStream(path + filename));
    Packages.rsl.FileManager.pipe(instream,
        new java.io.BufferedOutputStream(this.zip_output_stream));
//    instream.close();        InputStream is closed by pipe() anyway
});


/**
* To unzip a zip file to a given target directory
* @param String path of zip file, and string path of target directory
*/
module.exports.define("unzip", function (zipfile, target_dir) {
    var zip;
    var iter;
    var next_entry;
    var instream;
    var outstream;

    this.info("unzipping: " + zipfile + " to " + target_dir);
    zip = new java.util.zip.ZipFile(zipfile);
    iter = zip.entries();
    while (iter.hasMoreElements()) {
        next_entry = iter.nextElement();
        instream = new java.io.BufferedInputStream(zip.getInputStream(next_entry));
        outstream = new java.io.BufferedOutputStream(
            new java.io.FileOutputStream(target_dir + next_entry.getName()));
        Packages.rsl.FileManager.pipe(instream, outstream);
        outstream.close();
    }
    zip.close();
});

module.exports.define("realReadFile", function (file_path) {
    var java_scanner;
    var java_file;
    var content;

    java_file = new java.io.File(file_path);
    java_scanner = new java.util.Scanner(java_file, "UTF-8").useDelimiter("\\Z");
    content = String(java_scanner.next());

    try {
        java_scanner.close();
    } catch (ignore) {}

    return content;
});
