"use strict";

var Core = require("lapis-core/index.js");
var UI = require("lazuli-ui/index.js");
var IO = require("lazuli-io/index.js");
var Access = require("lazuli-access/index.js");
var Rhino = require("lazuli-rhino/index.js");


module.exports = Core.Base.clone({
    id: "HttpServer",
});


// Methods below are currently called from Java "out of context" - without 'this'
// being set properly...
module.exports.define("collectHttpParametersFromJava", function (request) {
    var en = request.getParameterNames();
    var out = {};
    var param;
    var values;
    var i;

    while (en.hasMoreElements()) {
        param = en.nextElement();
        values = request.getParameterValues(param);
        for (i = 1; i < values.length; i += 1) {
            values[0] += "|" + values[i];
        }
        // apply whitelist to incoming params
        out[param] = IO.JSoup.escape(values[0]);
    }
    return out;
});


module.exports.define("getSession", function (request) {
    // create session object if not already there
    var http_session = request.getSession(true);
    return http_session.getAttribute("js_session");
});


// seconds to allow resource to be cached for, -1 means DON'T CACHE
module.exports.define("setCacheHeaders", function (response, seconds) {
    var expires = new Date();
    if (seconds < 0) {
        seconds = -1000;    // To accommodate for clock variations between client and server
        response.setHeader("Cache-Control", "no-cache, no-store");
        response.setHeader("Pragma", "no-cache");
    } else {
        response.setHeader("Cache-Control", "max-age=" + seconds);
        response.setHeader("Pragma", "");
    }
    expires.add("s", seconds);
    response.setHeader("Expires", expires.toUTCString());    // should be RFC-1123 format
});


module.exports.define("reset", function (request, response) {
    var http_session = request.getSession(true);
    var js_session = http_session.getAttribute("js_session");

    module.exports.info("--- reset() called on runtime started at: " + Rhino.app.start_time +
        " on js_session " + (js_session && js_session.id) + " ---");
    if (!js_session || !js_session.isUserInRole("sysmgr")) {
        module.exports.throwError("sysmgr function only");
    }
    // want to keep http_session valid but close js_session then stop Rhino.app, so must do
    // things in this order...
    // prevent js_session.close() from invalidating the http_session
    delete js_session.http_session;
    http_session.removeAttribute("js_session");
    js_session.close();
    Rhino.app.stop();
    response.getWriter().println("environment is reset");
});


module.exports.define("start", function () {
    module.exports.info("--- start() called on runtime started at: " + Rhino.app.start_time + " ---");
});


module.exports.define("stop", function () {
    module.exports.info("--- stop() called on runtime started at: " + Rhino.app.start_time + " ---");
    Rhino.app.stop();
});


module.exports.define("rebuild", function (request, response) {
    var http_session = request.getSession(true);
    var js_session = http_session.getAttribute("js_session");

    module.exports.info("--- rebuild() on js_session " + (js_session && js_session.id) + " ---");
    if (!js_session || !js_session.isUserInRole("sysmgr")) {
        module.exports.throwError("sysmgr function only");
    }
    // prevent js_session.close() from invalidating the http_session
    delete js_session.http_session;
    http_session.removeAttribute("js_session");
    js_session.close();
    Rhino.app.rebuild();
    response.getWriter().println("rebuild completed");
});


module.exports.define("logout", function (request, response) {
    var http_session = request.getSession(false);
    module.exports.info("--- logout() ---");
    if (http_session) {
        http_session.invalidate();          // rsl.SessionListener.java calls invalidate() below....
    }
});


// Called from rsl.SessionListener
module.exports.define("invalidate", function (http_session) {
    var js_session = http_session.getAttribute("js_session");
    module.exports.debug("---");
    module.exports.info("--- invalidate(): " + (js_session && js_session.id) + " ---");
    if (js_session) {
        js_session.close();
        http_session.removeAttribute("js_session");
    } else {
        module.exports.info("--- invalidate() --- http_session is null ---");
    }
});


module.exports.define("login", function (request, response) {
    var http_session = request.getSession(true);
    var js_session = http_session.getAttribute("js_session");
    var user_id;
    var json_obj = {};
    var ref_params;
    var url;

    module.exports.debug("---");
    module.exports.info("--- login() ---");
    if (js_session) {
        http_session.removeAttribute("js_session");
        js_session.close();
    }
    if (request.getUserPrincipal()) {
        user_id = String(request.getUserPrincipal().getName());
        module.exports.debug("    login() authenticated as: " + user_id + ", http_session valid? " + request.isRequestedSessionIdValid());
        js_session = module.exports.createSession(request, user_id);
        if (!json_obj.action) {
            json_obj.action = "normal_login";
        }
    }
    if (js_session) {
        json_obj.session = js_session.getJSON();
        url = String(request.getHeader("referer")).split("?");
        if (url.length > 1) {
            ref_params = module.exports.splitParams(url[1]);
            if (ref_params.page_id && UI.pages.get(ref_params.page_id)) {
                UI.pages.get(ref_params.page_id).setRedirectUrl(json_obj, ref_params);
            }
        }
    }
    response.setContentType("application/json;charset=UTF-8");
    // seconds to allow resource to be cached for, -1 means DON'T CACHE
    module.exports.setCacheHeaders(response, -1);
    response.getWriter().println(JSON.stringify(json_obj));
});


module.exports.define("chameleonIn", function (request, response) {
    var http_session = request.getSession(true);
    var js_session = http_session.getAttribute("js_session");
    var real_user_id;
    var mimic_user_id = String(request.getParameter("mimic_user_id"));
    var status_code;

    module.exports.debug("---");
    if (!js_session) {
        status_code = 401;              // not authenticated
        module.exports.error("--- chameleonIn() --- NOT AUTHENTICATED");
    } else if (!js_session.isUserInRole("sysmgr")) {
        status_code = 403;              // forbidden
        module.exports.error("--- chameleonIn() --- NOT AUTHORIZED: " + js_session.user_id);
    } else if (!mimic_user_id) {
        status_code = 417;              // required parameter not supplied
        module.exports.error("--- chameleonIn() --- NO mimic_user_id parameter");
    } else {
        http_session.removeAttribute("js_session");
        js_session.close();
        real_user_id = js_session.user_id;             // actual user id
        module.exports.info("--- chameleonIn() --- user: " + real_user_id + " is mimicking: " + mimic_user_id);
        js_session = module.exports.createSession(request, mimic_user_id, real_user_id);
        status_code = 303;
        response.setHeader("Location", "../index.html#page_id=home");
    }
    // seconds to allow resource to be cached for, -1 means DON'T CACHE
    module.exports.setCacheHeaders(response, -1);
    response.setStatus(status_code);
});


module.exports.define("chameleonOut", function (request, response) {
    var http_session = request.getSession(true);
    var js_session = http_session.getAttribute("js_session");
    var status_code;

    module.exports.debug("---");
    if (!js_session) {
        status_code = 401;              // not authenticated
        module.exports.error("--- chameleonOut() --- NOT AUTHENTICATED");
    } else if (!js_session.chameleon) {
        status_code = 403;              // forbidden
        module.exports.error("--- chameleonIn() --- NOT AUTHORIZED: " + js_session.user_id);
    } else {
        http_session.removeAttribute("js_session");
        js_session.close();
        js_session = module.exports.createSession(request, js_session.chameleon);
        module.exports.info("--- chameleonOut() --- returning to: " + js_session.chameleon);
        status_code = 303;
        response.setHeader("Location", "../index.html#page_id=home");
    }
    // seconds to allow resource to be cached for, -1 means DON'T CACHE
    module.exports.setCacheHeaders(response, -1);
    response.setStatus(status_code);
});


module.exports.define("splitParams", function (referrer) {
    var url = String(referrer).split("?");
    var e;
    var a = /\+/g;  // Regex for replacing addition symbol with a space
    var r = /([^&=]+)=?([^&]*)/g;
    var d = function (s) { return s.replace(a, " "); };
    var out = {};
    if (url.length > 1) {
        e = r.exec(url[1]);
        while (e) {
            out[d(e[1])] = d(e[2]);
            e = r.exec(url[1]);
        }
    }
    return out;
});


module.exports.define("createSession", function (request, user_id, chameleon_id) {
    var js_session;
    var http_session = request.getSession(true);

    module.exports.info("--- createSession(" + user_id + ", " + chameleon_id + ") ---");
    js_session = Access.Session.getNewSession({
        user_id: user_id,
        user_agent: String(request.getHeader("User-Agent")),
        rsl_lb_server: String(request.getAttribute("RSL_LB_SERVER")),
        chameleon: chameleon_id,
        http_session: http_session,
        online: true,
    });

    http_session.setAttribute("js_session", js_session);
    http_session.setMaxInactiveInterval(js_session.max_inactive_interval);     // seconds
    return js_session;
});


module.exports.define("guestLogin", function (request, response) {
    var http_session = request.getSession(true);
    var js_session = http_session.getAttribute("js_session");
    var guest_id = String(request.getParameter("guest_id"));
    var json_obj = {};

    module.exports.info("--- guestLogin() ---");
    if (http_session && http_session.getAttribute("js_session")) {
        module.exports.throwError("HttpServer.guestLogin() error: js_session already bound to http_session");
    }
    if (request.getUserPrincipal()) {
        module.exports.throwError("HttpServer.guestLogin() error: http_session already has authenticated user");
    }
    if (guest_id.indexOf("guest") !== 0) {
        module.exports.throwError("HttpServer.guestLogin() error: guest account id must begin with 'guest': " + guest_id);
    }
    js_session = module.exports.createSession(request, guest_id, null);
    if (js_session.is_guest === true) {
        json_obj.session = js_session.getJSON();
        json_obj.action = "guest_login";
    } else {
        js_session.close();
        module.exports.throwError("HttpServer.guestLogin() error: js_session does not have is_guest set to true: " + guest_id);
    }
    response.setContentType("application/json;charset=UTF-8");
    // seconds to allow resource to be cached for, -1 means DON'T CACHE
    module.exports.setCacheHeaders(response, -1);
    response.getWriter().println(JSON.stringify(json_obj));
});


module.exports.define("exchange", function (request, response) {
    var js_session = module.exports.getSession(request);
    var params = module.exports.collectHttpParametersFromJava(request);
    var page;
    var json_obj;
    var xmlstream;
    var render_opts = {};

    module.exports.info("--- exchange(" + params.page_id + ") ---");
    // seconds to allow resource to be cached for, -1 means DON'T CACHE
    module.exports.setCacheHeaders(response, -1);

    try {
        if (!params.page_id) {
            module.exports.throwError({
                http_status: 417,
                log_level: module.exports.log_levels.debug,
                text: "required 'page_id' parameter not supplied",
            });
        }
        if (!js_session && params.guest_id) {
            if (params.guest_id.indexOf("guest") !== 0) {
                module.exports.throwError({
                    http_status: 417,
                    log_level: module.exports.log_levels.debug,
                    text: "invalid guest account",
                });          // new Error("guest account id must begin with 'guest': " + guest_id);
            }
            js_session = module.exports.createSession(request, params.guest_id, null);
        }
        if (!js_session) {
            module.exports.throwError({
                http_status: 401,
                log_level: module.exports.log_levels.debug,
                text: "no session object",
            });              // unauthorized
        }
        params.visit_start_time = (new Date()).getTime().toFixed(0);
        if (params.one_time_lock_code) {
            js_session.one_time_lock_code = params.one_time_lock_code;
        }
        module.exports.debug("    js_session: " + js_session.id + ", parameters: " + Core.Base.view.call(params));
        js_session.datetime_of_last_post = (new Date()).getTime();
        js_session.pings_since_last_post = 0;

        response.setContentType("text/html;charset=UTF-8");
        xmlstream = IO.XmlStream.clone({
            id: "http_xmlstream",
            name: "div",
            out: response.getWriter(),
            indent: null,
        });
        xmlstream.attribute("id", "css_page_normal");
        page = js_session.getPage(params.page_id, params.page_key);
        json_obj = page.exchange(params, xmlstream, render_opts);
        if (json_obj.redirect_url) {
            response.setHeader("Location", json_obj.redirect_url);
        } else {                // include messages if NOT redirecting elsewhere
            // TODO better way to link session and trans...
            if (page.trans && js_session.messages) {
                js_session.messages.trans = page.trans;
            }
            js_session.render(xmlstream, render_opts);
        }
        xmlstream.close();
    } catch (e1) {
        module.exports.report(e1, e1.log_level);
        json_obj = {};
        json_obj.http_status = e1.http_status || 500;
        json_obj.http_message = e1.text || "A system error has occurred, please contact support";
    }
//    response.setContentType("application/json;charset=UTF-8");
    response.setHeader("X-Response-Message", json_obj.http_message);
    response.setStatus(json_obj.http_status);
});


module.exports.define("extraJSON", function (request, response) {
    var js_session = module.exports.getSession(request);
    var params = module.exports.collectHttpParametersFromJava(request);
    var page;

    module.exports.debug("---");
    module.exports.info("--- extraJSON()" + (js_session ? " on js_session " + js_session.id : "")
        + ", page: " + params.page_id + (params.page_key ? ":" + params.page_key : "") + " ---");
    if (!js_session) {
        module.exports.throwError("Not logged in");
    }
    if (!params.page_id) {
        module.exports.throwError("Parameter 'page_id' must be supplied");
    }
    // seconds to allow resource to be cached for, -1 means DON'T CACHE
    module.exports.setCacheHeaders(response, -1);
    page = js_session.getPage(params.page_id, params.page_key);
    response.getWriter().println(JSON.stringify(page.extraJSON()));
});


module.exports.define("autocompleter", function (request, response) {
    var js_session = module.exports.getSession(request);
    var params = module.exports.collectHttpParametersFromJava(request);
    var page;
    var field;

    if (!js_session) {
        return;
    }
    page = js_session.page_cache[0];
    module.exports.debug("---");
    module.exports.info("--- autocompleter(" + params.field + ", " + params.q + ") on js_session " + js_session.id
        + ", page: " + page.id + (page.page_key ? ":" + page.page_key : "") + " ---");

    module.exports.debug("    parameters: " + Core.Base.view.call(params));
    if (!params.q) {
        module.exports.throwError("No query string specified");
    }
    if (!params.field) {
        module.exports.throwError("No field specified");
    }
    field = page.fields[params.field];
    if (!field) {
        module.exports.throwError("Field not found");
    }
    response.setContentType("text/plain");
    field.autocompleter(params.q, response.getWriter(), js_session);
});


module.exports.define("unisrch", function (request, response) {
    var js_session = module.exports.getSession(request);
    var params = module.exports.collectHttpParametersFromJava(request);
    var limit;

    module.exports.debug("---");
    module.exports.info("--- unisrch()" + (js_session ? " on js_session " + js_session.id : "") + " ---");
    module.exports.debug("    parameters: " + Core.Base.view.call(params));
    if (!js_session) {
        module.exports.throwError("Not logged in");
    }
    if (!params.q) {
        module.exports.throwError("No query string specified");
    }
    limit = params.limit || 20;
    response.setContentType("text/plain");
    js_session.unisrch(params.q, response.getWriter(), limit);
});


module.exports.define("tasks", function (request, response) {
    var js_session = module.exports.getSession(request);
    var xmlstream = IO.XmlStream.clone({
        id: "http_xmlstream",
        name: "div",
        out: response.getWriter(),
        indent: null,
    });

    module.exports.debug("---");
    module.exports.info("--- tasks()" + (js_session ? " on js_session " + js_session.id : "") + " ---");
    // seconds to allow resource to be cached for, -1 means DON'T CACHE
    module.exports.setCacheHeaders(response, -1);
    js_session.renderTasks(xmlstream);
    xmlstream.close();
});


module.exports.define("menu", function (request, response) {
    var js_session = module.exports.getSession(request);
    var xmlstream = IO.XmlStream.clone({
        id: "http_xmlstream",
        name: "div",
        out: response.getWriter(),
        indent: null,
    });

    module.exports.debug("---");
    module.exports.info("--- menu()" + (js_session ? " on js_session " + js_session.id : "") + " ---");
    // seconds to allow resource to be cached for, -1 means DON'T CACHE
    module.exports.setCacheHeaders(response, 28800);
    xmlstream.attribute("id", "css_menu_replace");
    Access.MenuItem.render(js_session, xmlstream);
    xmlstream.close();
});


module.exports.define("execute", function (request, response) {
    var cmd = String(request.getParameter("cmd"));
    var out;
    module.exports.debug("---");
    module.exports.info("--- execute() " + cmd + " ---");
    try {
        out = String(eval(cmd));        // eslint-disable-line no-eval
    } catch (e) {
        out = "Error: " + e.toString();
    }
    module.exports.debug(out);
    response.getWriter().println(out);
});


module.exports.define("openVCal", function (request, response) {
    var js_session = module.exports.getSession(request);
    var params = module.exports.collectHttpParametersFromJava(request);
    var page = js_session.page_cache[0];
    var field;

    module.exports.debug("---");
    module.exports.info("--- openVCal()" + (js_session ? " on js_session " + js_session.id : "")
        + ", page: " + page.id + (page.page_key ? ":" + page.page_key : "") + " ---");
    module.exports.debug("    parameters: " + Core.Base.view.call(params));
    if (!params.field) {
        module.exports.throwError("No field specified");
    }
    field = page.fields[params.field];
    if (!field) {
        module.exports.throwError("Field not found");
    }
    response.setContentType("text/calendar");
    field.outputVCal(response.getWriter());
});


// all http requests redirected here if user-agent matches crawlerPattern....
module.exports.define("crawlerHit", function (request, response) {
    response.setStatus(403);        // forbidden
});

module.exports.define("renderEmailPreview", function (request, response) {
    var js_session = request.getSession(false).getAttribute("js_session");
    var params = module.exports.collectHttpParametersFromJava(request);
    var page;

    module.exports.debug("---");
    module.exports.info(
        "--- renderEmailPreview()" + (js_session ? " on js_session " + js_session.id : "") +
        ", page: " + params.page_id + (params.page_key ? ":" + params.page_key : "") + " ---"
    );
    if (!js_session) {
        module.exports.throwError({
            id: "not_logged_in",
            text: "Not logged in",
        });
    }
    if (!params.page_id) {
        module.exports.throwError({
            id: "missing_page_id",
            text: "Parameter 'page_id' must be supplied",
        });
    }
    if (params.page_id !== "ac_email_display") {
        module.exports.throwError({
            id: "wrong_page",
            text: "Page id must be ac_email_display",
        });
    }
    // seconds to allow resource to be cached for, -1 means DON'T CACHE
    module.exports.setCacheHeaders(response, -1);
    page = js_session.getPage(params.page_id, params.page_key);
    response.getWriter().println(page.getPrimaryRow().getBodyWithImagesEmbedded());
});
