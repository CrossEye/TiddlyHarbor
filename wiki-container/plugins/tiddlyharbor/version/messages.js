/*\
title: $:/plugins/tiddlyharbor/version/messages.js
type: application/javascript
module-type: startup

Registers message handlers for tm-harbor-force-save and
tm-harbor-bump-version, communicating with the Express API.

\*/

(function () {
"use strict";

exports.name = "tiddlyharbor-version-messages";
exports.after = ["startup"];
exports.synchronous = true;

function getBaseUrl() {
	return location.pathname.replace(/\/+$/, "") + "/";
}

function setStatus(text) {
	$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/version-status", text: text });
}

function apiPost(endpoint, body, onSuccess) {
	var xhr = new XMLHttpRequest();
	xhr.open("POST", getBaseUrl() + endpoint, true);
	xhr.withCredentials = true;
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.setRequestHeader("X-Requested-With", "TiddlyWiki");
	xhr.onload = function () {
		try {
			var data = JSON.parse(xhr.responseText);
			if (xhr.status >= 200 && xhr.status < 300) {
				onSuccess(data);
			} else {
				setStatus("Error: " + (data.message || "request failed"));
			}
		} catch (e) {
			setStatus("Error: could not parse response");
		}
	};
	xhr.onerror = function () { setStatus("Error: network request failed"); };
	xhr.send(body ? JSON.stringify(body) : "{}");
}

exports.startup = function () {
	if (!$tw.browser) { return; }

	$tw.rootWidget.addEventListener("tm-harbor-force-save", function () {
		setStatus("Saving...");
		apiPost("api/save", {}, function (data) {
			setStatus(data.committed ? "Saved!" : (data.message || "Nothing to commit"));
		});
	});

	$tw.rootWidget.addEventListener("tm-harbor-bump-version", function (event) {
		var bump = event.paramObject && event.paramObject.bump;
		if (!bump) { setStatus("Error: no bump type"); return; }
		setStatus("Bumping " + bump + "...");
		apiPost("api/version", { bump: bump }, function (data) {
			$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/version", text: data.newVersion || "0.0.0" });
			setStatus("Bumped to v" + data.newVersion + " (was " + data.previousVersion + ")");
		});
	});
};

})();
