/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla verified email prototype.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Richard Newman <rnewman@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Server-side Javascript module that implements the Mozilla Identity API:
 *
 *   https://wiki.mozilla.org/MozillaID
 *
 */

var IdentityService = function() {

  /*
   * Utility functions.
   */
  function log(m) {
    if (console.log)
      console.log("IdentityService: " + m);
  }

  // Return the body but with a different operation. This is to pass back
  // results from internal composed operations as the result of a user-facing
  // operation.
  function opify(o, b) {
    if (b)
      b.operation = o;
    return b;
  }

  // Copy operation, success, and error items into a response object.
  function buildResponse(from, op, to) {
    to.operation = op;
    if (!(to.success = from.success))
      to.error = from.error;
    return to;
  }

  // I don't know why the origin sometimes arrives as the string "null"
  // rather than a real null, but there we are.
  function origin(m) {
    return (m.origin == "null") ? null : m.origin;
  }

  /*
   * Main service object.
   */
  return {
    identityOrigin:  "http://web4.dev.svc.mtv1.mozilla.com",
    identityBaseURL: "http://web4.dev.svc.mtv1.mozilla.com/1/",

    /*
     * Mini postMessage communication framework. Each mailbox represents a
     * callback; the appropriate callback is invoked when a reply hits the
     * mailbox.
     *
     * A utility function, sendExpectingReply, lodges the provided callback in
     * a (new, if necessary) mailbox and sends the message on.
     */
    mailboxes: {},

    newMailbox: function () {
      var i = 0;
      return function newMailbox() {
        return "m" + i++;
      };
    }(),

    mailbox: function mailbox(message) {
      if (!message.mailbox)
        return null;
      return this.mailboxes[message.mailbox];
    },

    send: function send(dest, message, origin) {
      if (!origin)
        throw "Refusing to send to open origin.";

      log("Sending message to origin " + JSON.stringify(origin));
      dest.postMessage(JSON.stringify(message), origin);
    },

    sendExpectingReply: function sendExpectingReply(dest, message, callback, origin) {
      if (!message.mailbox)
        message.mailbox = this.newMailbox();

      this.mailboxes[message.mailbox] = callback;
      this.send(dest, message, origin);
    },

    // Either call the specified callback, or use default handling.
    receive: function receive(m, message) {
      var callback = this.mailbox(message);
      if (callback) {
        log("Got reply on mailbox " + message.mailbox + ".");
        delete this.mailboxes[message.mailbox];
        callback(m, message);
      }
      else {
        this.defaultHandler(m, message);
      }
    },

    /*
     * postMessage handler functions.
     */
    defaultHandler: function defaultHandler(m, message) {
      // These are messages that don't need an existing channel.
      switch (message.operation) {
        case "getVerifiedEmail":
          this.getVerifiedEmail(m, message);
          break;
        default:
          var unknownOpFailure = {operation: "unknown",
                                  success: false,
                                  mailbox: message.mailbox};
          this.send(m.source,
                    unknownOpFailure,
                    origin(m));
          break;
      }
    },

    handlePostMessage: function handlePostMessage(m) {
      if (!origin(m)) {
        log("Rejecting message with null origin.");
        return;
      }

      var message;
      try {
        message = JSON.parse(m.data);
      } catch (ex) {
        // Drop it on the floor.
        log("Malformed JSON message: ignoring.");
        return;
      }

      // Hooray! Valid origin and JSON body.
      this.receive(m, message);
    },

    // Make an XHR POST request and parse the response.
    doRequest: function doRequest(operation, params) {
      var req = new XMLHttpRequest();
      var uri = this.identityBaseURL + operation;
      log("Making request to " + uri);
      req.open("POST", uri, false);

      var formData = new FormData();
      formData.append("output", "json");

      if (params) {
        var v;
        for (var k in params) {
          if ((v = params[k]))
            formData.append(k, params[k]);
        }
      }
      try {
        req.send(formData);
      } catch (ex) {
        log("Got exception " + ex + " in doRequest to " + uri);
        return {success: false, exception: ex};
      }

      req.success = false;
      if (req.responseText) {
        try {
          log("Response was " + req.responseText);
          req.responseJSON = JSON.parse(req.responseText);
          req.success = req.responseJSON && (req.status == 200);
        } catch (ex) {
          // Probably a failure; nothing to do here.
        }
      }

      return req;
    },

    /*
     * Popup creation. We can't directly poke at a source window ourselves, so
     * use the mailbox framework to ask our wrapper to do it.
     */
    createPopup: function createPopup(source, uri, callback, origin) {
      var msg = {operation: "popup", target: "_blank", uri: uri};
      this.sendExpectingReply(source, msg, callback, origin);
    },

    /*
     * Abstractions for service API calls.
     */
    loggedIn: function loggedIn() {
      var op  = "logged_in";
      var req = this.doRequest(op);
      var rep = {result: req.success && req.responseJSON.success};
      return buildResponse(req, op, rep);
    },

    getDefaultEmail: function getDefaultEmail(audience) {
      var op  = "get_default_email";
      var req = this.doRequest(op, {"audience": audience});
      var rep = {result: req.success && req.responseJSON.email};
      return buildResponse(req, op, rep);
    },

    getEmails: function getEmails(audience) {
      var op  = "get_emails";
      var req = this.doRequest(op, {"audience": audience});
      var rep = {result: req.success && req.responseJSON.emails};
      return buildResponse(req, op, rep);
    },

    // It sure would be nice to have some timeouts on these operations.
    getVerifiedEmail: function getVerifiedEmail(m, message) {
      var op   = "getVerifiedEmail";
      var self = this;

      function reply(body) {
        self.send(m.source, body, origin(m));
      }

      function fail() {
        reply({operation: op, success: false});
      }

      var loggedIn = this.loggedIn().result;
      if (loggedIn) {
        log("Logged in: getting default email.");

        // Note that the origin of the message is used as the audience.
        reply(opify(op, this.getDefaultEmail(origin(m))));
        return;
      }

      // Get an active session via a popup.
      log("Not logged in: creating popup.");
      function handlePopupMessage(pm, contents) {
        log("Got message from popup: " + JSON.stringify(contents));
        if (!contents.success) {
          fail();
          return;
        }

        log("Fetching default email and replying...");
        var defaultEmailResponse = self.getDefaultEmail(origin(m));
        log("Default email response: " + JSON.stringify(defaultEmailResponse));
        if (!defaultEmailResponse.success) {
          fail();
          return;
        }
        defaultEmailResponse.operation = op;  // Preserve our op but keep the result.
        reply(opify(op, defaultEmailResponse));

        // Close the popup.
        try {
          self.send(m.source, {operation: "closePopup"}, origin(m));
        } catch (ex) {
          // Oh well, popup sticks around.
        }
      }

      this.createPopup(m.source,
                       this.identityBaseURL + "login",
                       handlePopupMessage,
                       origin(m));
    }
  };
}();

// Sign up for input from our containing window.
window.addEventListener("message",
                        function(m) { IdentityService.handlePostMessage(m); },
                        true);
