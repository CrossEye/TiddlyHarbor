/*\
title: $:/plugins/tiddlyharbor/version/startup.js
type: application/javascript
module-type: startup

Fetches /status on page load and populates $:/status/user-role,
$:/temp/tiddlyharbor/version, and git-save state from the server.

Sets a CSS variable for the quiescence-based color transition and
watches for wiki changes to flip the save-state dot to "pending".

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
		var quiescenceSeconds = 300;
		if (xhr.status === 200) {
			try {
				var data = JSON.parse(xhr.responseText);
				$tw.wiki.addTiddler({ title: "$:/status/user-role", text: data["user-role"] || "anonymous" });
				$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/version", text: data.wiki_version || "0.0.0" });
				$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/dirty", text: data.wiki_dirty ? "yes" : "no" });
				quiescenceSeconds = data.quiescence_seconds || 300;

				// Set CSS transition duration to match the quiescence interval
				document.documentElement.style.setProperty("--th-quiescence-duration", quiescenceSeconds + "s");
			} catch (e) { /* ignore parse errors */ }
		}

		// Watch for wiki changes to drive the save-state dot.
		var waitingTimer = null;
		var quiescenceMs = quiescenceSeconds * 1000;

		function formatTime(date) {
			var h = date.getHours(), m = date.getMinutes();
			return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
		}

		function setTooltip(text) {
			var dots = document.querySelectorAll(".th-save-dot");
			for (var i = 0; i < dots.length; i++) {
				dots[i].setAttribute("title", text);
			}
		}

		$tw.wiki.addEventListener("change", function (changes) {
			// Server committed — git-status tiddler updated via syncer poll
			if (changes["$:/tiddlyharbor/git-status"]) {
				if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
				$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/save-state", text: "saved" });
				setTooltip("All changes saved. Click to save now.");
				return;
			}

			// Ignore changes to our own temp/state tiddlers
			var dominated = true;
			for (var title in changes) {
				if (title.indexOf("$:/temp/") !== 0 &&
					title.indexOf("$:/state/") !== 0 &&
					title.indexOf("$:/status/") !== 0 &&
					title.indexOf("$:/tiddlyharbor/") !== 0 &&
					title !== "$:/StoryList" &&
					title.indexOf("$:/HistoryList") !== 0) {
					dominated = false;
					break;
				}
			}
			if (!dominated) {
				// Snap to red
				if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
				$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/save-state", text: "pending" });
				var eta = new Date(Date.now() + quiescenceMs);
				setTooltip("Autosaving at " + formatTime(eta) + ". Click to save now.");
				// After a brief paint delay, switch to "waiting" to start the slow red→green fade
				waitingTimer = setTimeout(function () {
					waitingTimer = null;
					$tw.wiki.addTiddler({ title: "$:/temp/tiddlyharbor/save-state", text: "waiting" });
				}, 100);
			}
		});

		callback();
	};
	xhr.onerror = function () { callback(); };
	xhr.send();
};

})();
