/*\
title: $:/plugins/tiddlyharbor/version/startup.js
type: application/javascript
module-type: startup

Fetches /status on page load and populates $:/status/user-role
and $:/temp/tiddlyharbor/version from the server response.

\*/

(function () {
"use strict";

exports.name = "tiddlyharbor-version-startup";
exports.after = ["startup"];
exports.synchronous = false;

exports.startup = function (callback) {
	if (!$tw.browser) { callback(); return; }

	var basePath = location.pathname.replace(/\/+$/, "");

	var xhr = new XMLHttpRequest();
	xhr.open("GET", basePath + "/status", true);
	xhr.withCredentials = true;
	xhr.onload = function () {
		if (xhr.status === 200) {
			try {
				var data = JSON.parse(xhr.responseText);
				$tw.wiki.addTiddler({ title: "$:/status/user-role", text: data["user-role"] || "anonymous" });
				$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/version", text: data.wiki_version || "0.0.0" });
			} catch (e) { /* ignore parse errors */ }
		}
		callback();
	};
	xhr.onerror = function () { callback(); };
	xhr.send();
};

})();
