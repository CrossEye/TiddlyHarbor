/*\
title: $:/plugins/tiddlyharbor/version/bump-macro.js
type: application/javascript
module-type: macro

Macro that computes a bumped semver string for display in the UI.
Usage: <<bump-version version type>>

\*/

(function () {
"use strict";

exports.name = "bump-version";
exports.params = [
	{ name: "version" },
	{ name: "type" }
];

exports.run = function (version, type) {
	var parts = (version || "0.0.0").split(".").map(Number);
	var major = parts[0] || 0, minor = parts[1] || 0, patch = parts[2] || 0;
	if (type === "major") return (major + 1) + ".0.0";
	if (type === "minor") return major + "." + (minor + 1) + ".0";
	return major + "." + minor + "." + (patch + 1);
};

})();
