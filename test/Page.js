/*jslint node: true */
/*global java */
"use strict";
var Session      = require("../session/Session")
  , Connection   = require("../sql/Connection")
  ;

Connection.setJava(java);

module.exports.main = function (test) {
    var session = Session.getNewSession({ user_id: "batch" }),
        page,
        page2;

    test.expect(100);

    // Session tests
    test.equal(session.user_name, "Batch Run", "User name is Batch Run");
    test.ok(typeof session.id === "string" && !isNaN(session.id), "session id is a string, storing a number");
    test.equal(session.active, true, "session is active");
    test.equal(session.visits, 0, "session visits = 0");
    test.equal(session.messages.number, 1, "session messages = 1");
    if (session.id === "1") {
        test.equal(session.messages.getString().indexOf("This is your first log-in"           ), 0, "session message string begins 'This is your first log-in'");
    } else {
        test.equal(session.messages.getString().indexOf("Welcome back! You last logged in on "), 0, "session message string begins 'Welcome back! You last logged in on '");
    }

    page = session.getPage("sy_list_search");       // changed from 'home' as will probably change less going forwards
    test.equal(page.id, "sy_list_search", "page id is 'sy_list_search'");
    test.equal(page.toString(), "/Base/Page/sy_list_search/sy_list_search", "page toString() is '/Base/Page/sy_list_search/sy_list_search'");
    test.equal(page.active, true, "page is active");
    test.equal(session.visits, 0, "session visits still = 0");
    test.equal(session.messages.number, 1, "session messages still = 1");
    test.equal(session.visits, 0, "session visits = 0");
    test.equal(typeof page.page_key, "undefined", "page_key is undefined");
    test.equal(page.tabs.length(), 0, "sy_list_search page has 0 tabs");
    //test.equal(page.tabs.get(0).id, "details", "home page tab id = 'details'");
    //test.equal(page.tabs.get(0).label, "Details", "home page tab label = 'Details'");
    //test.equal(page.tabs.get(0).visible, true, "home page tab is visible");
    test.equal(page.sections.length(), 1, "sy_list_search page has 1 section (search)");
    test.equal(page.sections.get(0).id, "main", "sy_list_search page section 0 id = 'main'");
    test.equal(page.sections.get(0).type, "Search", "sy_list_search page section 0 type = 'Search'");
    test.equal(page.sections.get(0).tab, undefined, "sy_list_search page section 0 tab = undefined");
    test.equal(page.sections.get(0).entity, "sy_list", "sy_list_search page section 0 entity = sy_list");
    test.equal(page.links.length(), 1, "sy_list_search page has 1 link");
    test.equal(page.links.get(0).id, "create", "sy_list_search page link 0 id = 'create'");
    test.equal(page.links.get(0).page_to, "sy_list_create", "sy_list_search page link 0 type = 'sy_list_create'");
    test.equal(page.buttons.length(), 0, "sy_list_search page has 0 buttons");
    page.update({});
    test.equal(page.active, true, "page is still active after update");
    test.equal(session.visits, 1, "session visits = 1");
    test.equal(session.messages.number, 1, "session messages still = 1");
    test.equal(session.getPage("sy_list_search"), page, "session getPage(sy_list_search) returns same object");
    page.cancel();
    test.equal(page.active, false, "page is not active after cancel");
    page2 = session.getPage("sy_list_search");
    test.equal(page.active, false, "page is not active after cancel");
    test.equal(page2.active, true, "new page is active after getPage()");


    Connection.shared.executeUpdate("DELETE FROM ac_user WHERE id LIKE 'quent%'");
    Connection.shared.executeUpdate("DELETE FROM ac_user_role WHERE user_id NOT IN ( SELECT _key FROM ac_user )");
    Connection.shared.executeUpdate("DELETE FROM ac_user_deleg WHERE delegater NOT IN ( SELECT _key FROM ac_user )");
    Connection.shared.executeUpdate("DELETE FROM ac_user_deleg WHERE delegatee NOT IN ( SELECT _key FROM ac_user )");


    page = session.getPage("ac_user_create");
    test.equal(page.sections.get(0).fieldset.modifiable, true, "New User record is modifiable - initial create, no values supplied");
    //test.equal(page.sections.get(0).record.row_number, 0, "New User record number = 0");
    test.equal(page.sections.get(0).fieldset.getKey(), "", "New User record key is ''");
    test.equal(page.sections.get(0).fieldset.isValid(), false, "New User record is NOT valid");
    test.equal(page.trans.isValid(), false, "Page transaction is NOT valid");
    test.equal(page.trans.isActive(), true, "Page transaction is active");
    test.equal(page.trans.isModified(), false, "Page transaction is NOT modified");
    test.equal(page.trans.getRowCount(), 1, "Page transaction row count = 1");
    test.equal(page.trans.getPartialKeyRowCount(), 1, "Page transaction has 1 partial-key row");
    test.equal(page.trans.getFullKeyRowCount(), 0, "Page transaction has 0 full-key row");

    page.update({ create_id: "quentin", create_name: "Tarantino, Quentin", create_email: "quentin.tarantino@gmail.com", create_user_type: "ac.core" });
    test.equal(page.trans.isValid(), true, "Page transaction is valid - initial create, after values supplied");
    test.equal(page.trans.isActive(), true, "Page transaction is active");
    test.equal(page.trans.isModified(), true, "Page transaction is modified");
    test.equal(page.trans.getRowCount(), 1, "Page transaction row count = 1");
    test.equal(page.trans.getPartialKeyRowCount(), 0, "Page transaction has 0 partial-key row");
    test.equal(page.trans.getFullKeyRowCount(), 1, "Page transaction has 1 full-key row");

    page.update({ page_button: "save" });
    test.ok(page.trans.saved, "Create page saved successfully - 1st create");

    page = session.getPage("ac_user_create");
    page.update({ page_button: "add_row_field_roles", add_row_field_roles: "rl_vr_admin" });     // added before key defined
    page.update({ create_id: "quentin", create_name: "Tarantino, Quentin", create_email: "quentin.tarantino@gmail.com", create_user_type: "ac.core" });      // dupl key
    test.equal(page.sections.get(0).fieldset.getKey(), "quentin", "New User record key is 'quentin' - even though is duplicate");
    test.equal(page.sections.get(0).fieldset.isValid(), false, "New User record is NOT valid");
    test.equal(page.trans.isValid(), false, "Page transaction is NOT valid");
    test.equal(page.trans.isActive(), true, "Page transaction is active");
    test.equal(page.trans.isModified(), true, "Page transaction is modified");
    test.equal(page.trans.getRowCount(), 2, "Page transaction row count = 2");
    test.equal(page.trans.getPartialKeyRowCount(), 2, "Page transaction has 2 partial-key row");
    test.equal(page.trans.getFullKeyRowCount(), 0, "Page transaction has 0 full-key row");
    page.update({ page_button: "save" });
    test.ok(!page.trans.saved, "Create page does not save - 2nd create");


    page.update({ create_id: "quentin2", create_email: "quentin.tarantino@hotmail.com" });
    test.equal(page.trans.isValid(), true, "Page transaction is valid - key changed to one that doesn't already exist");
    test.equal(page.trans.isActive(), true, "Page transaction is active");
    test.equal(page.trans.isModified(), true, "Page transaction is modified");
    test.equal(page.trans.getRowCount(), 2, "Page transaction row count = 2");
    test.equal(page.trans.getPartialKeyRowCount(), 0, "Page transaction has 0 partial-key row");
    test.equal(page.trans.getFullKeyRowCount(), 2, "Page transaction has 2 full-key row");
    page.update({ page_button: "save" });
    test.ok(page.trans.saved, "Create page saved successfully - 2nd create");


    page = session.getPage("ac_user_update", "quentin");
    test.equal(page.sections.get(0).fieldset.modifiable, true, "User record is modifiable - 1st update");
    //test.equal(page.sections.get(0).fieldset.row_number, 0, "User record number = 0");
    test.equal(page.sections.get(0).fieldset.getKey(), "quentin", "User record key is 'quentin'");
    test.equal(page.sections.get(0).fieldset.isValid(), true, "User record is valid");
    test.equal(page.trans.isValid(), true, "Page transaction is valid");
    test.equal(page.trans.isActive(), true, "Page transaction is active");
    test.equal(page.trans.isModified(), false, "Page transaction is not modified");
    test.equal(page.trans.getRowCount(), 1, "Page transaction row count = 1");
    test.equal(page.trans.getPartialKeyRowCount(), 0, "Page transaction has 0 partial-key row");
    test.equal(page.trans.getFullKeyRowCount(), 1, "Page transaction has 1 full-key row");

    page.update({ page_button: "add_row_field_roles", add_row_field_roles: "rl_ts_admin" });
    test.equal(page.trans.isValid(), true, "Page transaction is valid - new role sub-record added");
    test.equal(page.trans.isActive(), true, "Page transaction is active");
    test.equal(page.trans.isModified(), true, "Page transaction is modified");
    test.equal(page.trans.getRowCount(), 2, "Page transaction row count = 2");
    test.equal(page.trans.getPartialKeyRowCount(), 0, "Page transaction has 0 partial-key row");
    test.equal(page.trans.getFullKeyRowCount(), 2, "Page transaction has 2 full-key row");

    page.update({ page_button: "list_add_deleg" });
    test.equal(page.trans.isValid(), true, "Page transaction is valid - TODO delegate sub-record added, but no key yet");
    //test.equal(page.trans.isValid(), false, "Page transaction is NOT valid - delegate sub-record added, but no key yet");
    test.equal(page.trans.isActive(), true, "Page transaction is active");
    test.equal(page.trans.isModified(), true, "Page transaction is modified");
    test.equal(page.trans.getRowCount(), 3, "Page transaction row count = 3");
    test.equal(page.trans.getPartialKeyRowCount(), 1, "Page transaction has 1 partial-key row");
    test.equal(page.trans.getFullKeyRowCount(), 2, "Page transaction has 2 full-key row");

    //page.update({ page_button: "save" });
    //test.ok(!page.trans.saved, "Update page does not save - 1st update");

    page.update({ deleg_0_delegatee: "batch" });
    test.equal(page.trans.isValid(), true, "Page transaction is valid - key of new delegate sub-record supplied");
    test.equal(page.trans.isActive(), true, "Page transaction is active");
    test.equal(page.trans.isModified(), true, "Page transaction is modified");
    test.equal(page.trans.getRowCount(), 3, "Page transaction row count = 3");
    test.equal(page.trans.getPartialKeyRowCount(), 0, "Page transaction has 0 partial-key row");
    test.equal(page.trans.getFullKeyRowCount(), 3, "Page transaction has 3 full-key row");

    page.update({ page_button: "save" });
    test.ok(page.trans.saved, "Update page saved successfully - 1st update");

    if (!page.trans.saved) {
        page.cancel();
    }

    page = session.getPage("ac_user_delete", "quentin");
    page.update({ page_button: "save" });
    test.ok(page.trans.saved, "Delete page saved successfully");

    page = session.getPage("ac_user_delete", "quentin2");
    page.update({ page_button: "save" });
    test.ok(page.trans.saved, "Delete page saved successfully");

    test.done();
};

