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

function bumpSemver(version, type) {
	var parts = (version || "0.0.0").split(".").map(Number);
	if (type === "major") return (parts[0] + 1) + ".0.0";
	if (type === "minor") return parts[0] + "." + (parts[1] + 1) + ".0";
	return parts[0] + "." + parts[1] + "." + (parts[2] + 1);
}

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

	// Intercept TW's built-in tm-login message so the "Login" link in the
	// server-status dropdown navigates to our Express login page.
	$tw.rootWidget.addEventListener("tm-login", function () {
		var base = location.pathname.replace(/\/+$/, "");
		window.location.href = base + "/login";
		return false;
	});

	// Intercept tm-logout: clear role immediately (hides version segment
	// reactively) then redirect to our Express logout endpoint.
	$tw.rootWidget.addEventListener("tm-logout", function () {
		$tw.wiki.addTiddler({ title: "$:/status/user-role", text: "anonymous" });
		var base = location.pathname.replace(/\/+$/, "");
		window.location.href = base + "/logout";
		return false;
	});

	$tw.rootWidget.addEventListener("tm-harbor-force-save", function () {
		// Snap to green immediately on click
		$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/save-state", text: "saved" });
		apiPost("api/save", {}, function (data) {
			if (data.committed) {
				$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/dirty", text: "no" });
			}
		});
	});

	$tw.rootWidget.addEventListener("tm-harbor-bump-version", function (event) {
		var bump = event.paramObject && event.paramObject.bump;
		if (!bump) { setStatus("Error: no bump type"); return; }
		var current = $tw.wiki.getTiddlerText("$:/temp/tiddlyharbor/version") || "0.0.0";
		var target = bumpSemver(current, bump);
		if (!confirm("Are you sure you want to bump the version to v" + target + "? (This cannot be undone.)")) { return; }
		setStatus("Bumping " + bump + "...");
		apiPost("api/version", { bump: bump }, function (data) {
			$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/version", text: data.newVersion || "0.0.0" });
			$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/dirty", text: "no" });
			$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/save-state", text: "saved" });
		});
	});
};

})();
