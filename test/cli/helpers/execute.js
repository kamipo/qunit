"use strict";

const path = require( "path" );
const cp = require( "child_process" );
const reEscape = /([\\{}()|.?*+\-^$[\]])/g;

// Apply light normalization to CLI output to allow strict string
// comparison across Node versions and OS platforms against the
// expected output in fixtures/.
function normalize( actual ) {
	const dir = path.join( __dirname, "..", "..", ".." );
	const reDir = new RegExp( dir.replace( reEscape, "\\$1" ), "g" );

	return actual
		.replace( reDir, "/qunit" )
		.replace( /(\/qunit\/qunit\/qunit\.js):\d+:\d+\)/g, "$1)" )

		// convert sourcemap'ed traces from Node 14 and earlier to the
		// standard format used by Node 15+.
		// https://github.com/nodejs/node/commit/15804e0b3f
		// https://github.com/nodejs/node/pull/37252
		// Convert "at foo (/min.js:1)\n -> /src.js:2" to "at foo (/src.js:2)"
		.replace( /\b(at [^(]+\s\()[^)]+(\))\n\s+-> ([^\n]+)/g, "$1$3$2" )

		.replace( / {2}at .+\([^/)][^)]*\)/g, "  at internal" )

		// merge successive lines after initial frame
		.replace( /(\n\s+at internal)+/g, "$1" )

		// merge successive line with initial frame
		.replace( /(at internal)\n\s+at internal/g, "$1" );
}

// Executes the provided command from within the fixtures directory
// The execaOptions parameter is used by test/cli/watch.js to
// control the stdio stream.
//
// @param {Array} [options.stdio]
// @param {Object} [options.env]
//
module.exports.execute = async function execute( command, options = {}, hook ) {
	options.cwd = path.join( __dirname, "..", "fixtures" );

	// Avoid Windows-specific issue where otherwise 'foo/bar' is seen as a directory
	// named "'foo/" (including the single quote).
	options.windowsVerbatimArguments = true;

	let cmd = command[ 0 ];
	const args = command.slice( 1 );
	if ( cmd === "qunit" ) {
		cmd = "../../../bin/qunit.js";
		args.unshift( cmd );
		cmd = process.execPath;
	}
	if ( cmd === "node" ) {
		cmd = process.execPath;
	}

	const spawned = cp.spawn( cmd, args, options );

	if ( hook ) {
		hook( spawned );
	}

	const result = {
		code: null,
		stdout: "",
		stderr: ""
	};
	spawned.stdout.on( "data", data => {
		result.stdout += data;
	} );
	spawned.stderr.on( "data", data => {
		result.stderr += data;
	} );
	const execPromise = new Promise( ( resolve, reject ) => {
		spawned.on( "error", error => {
			reject( error );
		} );
		spawned.on( "exit", ( exitCode, _signal ) => {
			result.code = exitCode;
			if ( exitCode !== 0 ) {
				reject( new Error( "Error code " + exitCode ) );
			} else {
				resolve();
			}
		} );
	} );

	try {
		await execPromise;
		result.stdout = normalize( String( result.stdout ).trimEnd() );
		result.stderr = String( result.stderr ).trimEnd();
		return result;
	} catch ( e ) {
		e.pid = result.pid;
		e.code = result.code;
		e.stdout = normalize( String( result.stdout ).trimEnd() );
		e.stderr = String( result.stderr ).trimEnd();
		throw e;
	}
};

// Very loose command formatter.
// Not for the purpose of execution, but for the purpose
// of formatting the string key in fixtures/ files.
module.exports.prettyPrintCommand = function prettyPrintCommand( command ) {
	return command.map( arg => {

		// Quote spaces and stars
		return /[ *]/.test( arg ) ? `'${ arg }'` : arg;
	} ).join( " " );
};
