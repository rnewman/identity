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
 * Client-side Javascript module that implements the Mozilla Identity API:
 *
 *   https://wiki.mozilla.org/MozillaID
 *
 */

(function() {
  function log(m) {
    if (console.log)
      console.log("navigator.id: " + m);
  }

  // Don't do anything if the browser provides its own navigator.id
  // implementation. If we already injected one here -- typically the case if
  // you reload the page -- then unhook it and start from scratch.
  // This avoids errors like "attempt to run compile-and-go script on a cleared
  // scope".
  if (navigator.id) {
    if (navigator.id.isInjected &&
        navigator.id.unhook) {
      // Remove the existing object and its handlers.
      log("Unhooking existing navigator.id.");
      navigator.id.unhook();
    } else {
      log("Not swizzling.");
      return;
    }
  }

  log("Swizzling navigator.id.");
  navigator.id = {
    isInjected: true,    // Differentiate from a built-in object.
    unhook: null,        // This gets built later, once we know what to unhook!

    // The primary interface function. Do everything necessary to retrieve the
    // user's verified email, including creating popups. Calls 'callback'
    // with the return message, which looks like this:
    //
    //   {success: true,
    //    operation: "getVerifiedEmail",
    //    result: "user@domain.com"}
    //
    // or
    //
    //   {success: false,
    //    operation: "getVerifiedEmail",
    //    error: {"code": 123,
    //            "reason": "problem"}}
    getVerifiedEmail: function getVerifiedEmail(callback) {
      var popup;                     // Window handle of our popup.
      var popupRequestMessage;       // Used to send replies from the popup.

      var identityOrigin   = "http://web4.dev.svc.mtv1.mozilla.com";
      var iframe           = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src           = identityOrigin + "/s/html/service_iframe.html";

      // We only ever send messages to the identity service, so we use it
      // as the origin here.
      function send(message) {
        iframe.contentWindow.postMessage(JSON.stringify(message), identityOrigin);
      }

      function handlePopup(message) {
        var popupFeatures = "scrollbars=yes" +
                            ",left="   + (message.left   || 80)  +
                            ",top="    + (message.top    || 80)  +
                            ",height=" + (message.height || 400) +
                            ",width="  + (message.width  || 400);

        log("In handlePopup: " + JSON.stringify(message));
        popup = window.open(message.uri, message.target, popupFeatures);
        if (!popup) {
          throw "Verified email fetcher found no popup!";
        }
        popupRequestMessage = message;
        log("Created popup: " + popup);
      }

      function handleClosePopup(message) {
        log("In handleClosePopup: " + JSON.stringify(message));
        if (popup) {
          popup.close();
        }
        popup = null;
        popupRequestMessage = null;
      }

      function handleLoginResponse(pm) {
        log("In handleLoginResponse.");
        pm.mailbox = popupRequestMessage.mailbox;
        send(pm);
      }

      function handlePost(m) {
        log("Origin: " + m.origin + "\n");
        log("Wrapper received: " + m.data + "\n");

        if (m.origin != identityOrigin) {
          log("Rejecting message with origin " + m.origin);
          return;
        }

        var message = JSON.parse(m.data);
        switch (message.operation) {

          // Comes from the iframe. Call the callback.
          case "getVerifiedEmail":
            callback(message);
            break;

          // "Please create a popup." Comes from the service.
          case "popup":
            handlePopup(message);
            break;

          case "closePopup":
            handleClosePopup(message);
            break;

          // Login popup did its work.
          case "login":
            handleLoginResponse(message);
            break;

          default:
            throw "Unknown operation.";
            break;
        }
      }

      // This is only a named function so that we can unhook it later.
      function doPost() {
        send({operation:"getVerifiedEmail"});
      }

      document.body.appendChild(iframe);

      // Send the getVerifiedEmail event as soon as the iframe is loaded.
      iframe.addEventListener("load", doPost, true);
      window.addEventListener("message", handlePost, true);  // For replies.

      this.unhook = function() {
        // Try our best to do each of these things.
        try {
          window.removeEventListener("message", handlePost, true);
        } catch (ex) {}
        try {
          iframe.removeEventListener("load", doPost, true);
        } catch (ex) {}
        try {
          document.body.removeChild(iframe);
        } catch (ex) {}

        delete navigator.id;
      }
    }
  };
})();
