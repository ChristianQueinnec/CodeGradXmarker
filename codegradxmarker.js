// CodeGradXmarker
// Time-stamp: "2017-10-23 18:03:37 queinnec"

/** Some utilities (in French or English) for CodeGradX.
Copyright (C) 2016-2017 Christian.Queinnec@CodeGradX.org

@module codegradxmarker
@author Christian Queinnec <Christian.Queinnec@codegradx.org>
@license MIT
@see {@link http://codegradx.org/|CodeGradX} site.

This module describes how student's code (and tests) are run and
compared to teacher's code. This plugin is run within CodeGradX
infrastructure to generate the student's report.

This code is node.js-specific. It requires the yasmini module and the
specific yasmini.require function to dynamically load modules.
See https://github.com/paracamplus/Yasmini.git



Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.


*/

(function () {
    // Don't pollute the global environment! It will be used to evaluate
    // the student's code and the teacher's tests.
    
let fs = require('fs');
let fs_writeFileSync = fs.writeFileSync;
let fs_readFileSync = fs.readFileSync;
//let fs_renameSync = fs.renameSync;
let vm = require('vm');
let yasmini = require('yasmini');
    yasmini.require = yasmini.yasmini_require;
let util = require('util');
let Promise = require('bluebird');
let he = require('he');

// Re-export yasmini:
module.exports = yasmini;

// preserve that value:
yasmini.original_describe = yasmini.describe;

// Messages in two languages (fr and en):

Object.assign(yasmini.message, {
    fr: {
        startEval: function (code) {
            return "J'évalue <code>" + he.encode(code) + "</code>";
        },
        startEvaluation: function () {
            return "Je vais évaluer votre code.";
        },
        finishEval: function () {
            return "Votre code s'évalue bien.";
        },
        stopEval: function () {
            return "Je m'arrête là!";
        },
        startTests: function () {
            return "Je vais maintenant vérifier votre code avec mes tests.";
        },
        failOwnTests: function () {
            return "Votre code ne passe pas vos propres tests!";
        },
        isAFunction: function (fname) {
            return "<code>" + he.encode(fname) +
                "</code> est bien une fonction";
        },
        notAFunction: function (fname) {
            return "<code>" + he.encode(fname) +
                "</code> n'est pas une fonction";
        },
        notSatisfying: function (exc) {
            return "Votre code n'est pas entièrement satisfaisant: <code>" +
                he.encode(exc.toString()) + "</code>";
        },
        bravo: function () {
            return 'OK';
        },
        fail: function (index, actual) {
            if ( typeof actual === 'undefined' ) {
                actual = 'undefined';
            }
            return "Échec de l'assertion #" + index +
                ": Je n'attendais pas votre résultat: <code>" +
                he.encode(util.inspect(actual)) + "</code>";
        },
        failException: function (index, exception) {
            return "Échec de l'assertion #" + index +
                ": Exception signalée: <code>" +
                he.encode(exception.toString()) + "</code>";
        },
        fullSuccess: function (expectationSuccessful, expectationAttempted) {
            return "Vous avez réussi " + expectationSuccessful +
                " de mes " + expectationAttempted + " tests.";
        },
        partialSuccess: function (expectationSuccessful, expectationAttempted) {
            return "Vous n'avez réussi que " + expectationSuccessful +
                " de mes " + expectationAttempted + " tests.";
        },
        checkFunction: function (message) {
            return "Je vais tester la fonction <code>" +
                he.encode(message) + "</code>";
        }
    },
    en: {
        startEval: function (code) {
            return "Evaluating <code>" + he.encode(code) + "</code>";
        },
        startEvaluation: function () {
            return "Let's start to evaluate your code.";
        },
        finishEval: function () {
            return "Your code has been correctly loaded.";
        },
        stopEval: function () {
            return "I stop here!";
        },
        startTests: function () {
            return "I'm going to check your code with my tests.";
        },
        failOwnTests: function () {
            return "Your code does not pass your own tests!";
        },
        isAFunction: function (fname) {
            return "<code>" + he.encode(fname) +
                "</code> exists and is a function.";
        },
        notAFunction: function (fname) {
            return "<code>" + he.encode(fname) +
                "</code> is not a function!";
        },
        notSatisfying: function (exc) {
            return "Your code is not correct, it raises: <code>" +
                he.encode(exc.toString()) + "</code>";
        },
        bravo: function () {
            return 'OK';
        },
        fail: function (index, actual) {
            if ( typeof actual === 'undefined' ) {
                actual = 'undefined';
            }
            return "Failed expectation #" + index +
                ": I was not expecting your result: <code>" +
                he.encode(util.inspect(actual)) + "</code>";
        },
        failException: function (index, exception) {
            return "Failed expectation #" + index +
                ": Exception is: <code>" +
                he.encode(exception.toString()) + "</code>";
        },
        fullSuccess: function (expectationSuccessful, expectationAttempted) {
            return "You pass " + expectationSuccessful + " of my " +
                expectationAttempted + " tests.";
        },
        partialSuccess: function (expectationSuccessful, expectationAttempted) {
            return "You only pass " + expectationSuccessful +
                " of my " + expectationAttempted + " tests.";
        },
        checkFunction: function (message) {
            return "I'm going to check function <code>" +
                he.encode(message) + "</code>";
        }
    }
});

yasmini.messagefn = function (key) {
    let translator = yasmini.message[yasmini.lang || 'fr'];
    if ( translator ) {
        let fn = translator[key];
        if ( fn ) {
            let args = Array.prototype.slice.call(arguments, 1);
            return fn.apply(null, args);
        } else {
            return key;
        }
    } else {
        return JSON.stringify(arguments);
    }
};

yasmini.trace = function (msg) {
    if (yasmini.config.verbose) {
        yasmini.verbalize('##', msg);
    }
};
    
/** 
    yasmini.makeAsPRE
    @param {string} s     long string with newlines
    @return {string}      long string with encoded newlines

    Transform a string containing newlines into a string where newlines
    are transformed into pilcrows. A post-tool may convert back these
    pilcrows into newlines.

*/

yasmini.makeAsPRE = function (s) {
    let pilcrow = '¶'; // U+00B6 pilcrow
    s = s.replace(/\n/g, pilcrow);
    return pilcrow + s + pilcrow;
};

/** Prepare a default pseudo global environment to be instantiated
    within student's and teacher's codes. Both create their own
    describe function.
*/

let defaultCurrentGlobal = {
    yasmini:  yasmini,
    //describe: to be defined later
    it:       yasmini.it,
    expect:   yasmini.expect,
    fail:     yasmini.fail,
    // allow student's or teacher's code to require some Node modules:
    require:  yasmini.yasmini_require
};

/* Check student's code with teacher's tests.
   This evaluation is done in the current global environment.

   @param {hash} config - Configuration parameters
   @param {string} specfile - name of the file containing teacher's tests
   @param {hash} things - student's functions

 */

let evalStudentTests_ = function (config, specfile, things) {
    yasmini.verbalize("+", yasmini.messagefn('startTests'));
    function after (b) {
        yasmini.verbalize("##", "after run_descriptions " + b);
        return b;
    }
    let descriptions = [];
    function _describe (msg, fn) {
        let desc = yasmini.original_describe(msg, fn);
        descriptions.push(desc);
        return desc;
    }
    function run_description (i) {
        yasmini.verbalize("##", "run_description " + i);
        if ( i < descriptions.length ) {
            let desc = descriptions[i];
            return desc.hence(function (d) {
                yasmini.verbalize("##", `after describe ${i}`);
                if ( !d.pass ) {
                    config.exitCode = 1;
                    if ( d.stopOnFailure ) {
                        return Promise.resolve(false);
                    }
                }
                return run_description(i+1);
            });
        } else {
            yasmini.verbalize("##", "run_description end ");
            return Promise.resolve(true);
        }
    }
    function run_descriptions () {
        return run_description(0).then(after, after);
    }

    // Use the same global context where student's code was evaluated.
    // It contains some yasmini related variables and student's own
    // definitions. For teacher's test code, we setup a new `describe`
    // function to collect descriptions:
    defaultCurrentGlobal.describe = _describe;
    Object.assign(global, defaultCurrentGlobal);
    
    return new Promise(function (resolve, reject) {
        try {
            let src = fs_readFileSync(specfile, 'UTF8');
            let imports = '';
            for (let fname in config.functions) {
                if ( typeof yasmini.require.exports[fname] !== 'undefined' ) {
                    imports += `let ${fname} = yasmini.require.exports.${fname};\n`;
                }
            }
            src = `
${imports}

${src}
            `;
            vm.runInThisContext(src, { displayErrors: true });
            yasmini.verbalize("##", "after teacher's tests defined");
            resolve(descriptions);
        } catch (exc) {
            reject(exc);
        }
    }).then(run_descriptions);
};

/* Eval student's code (in the current global environment)
 * Grab functions the exercise asked for, 
 * grab also the descriptions (the unit tests the student wrote).
 * return false to stop the marking process.
*/

let evalStudentCode_ = function (config, codefile) {
    return new Promise(function (resolve /*, reject */) {
        yasmini.verbalize("+", yasmini.messagefn('startEvaluation'));
        // accumulate student's describe() invocations:
        config.student = {
            tests: []
        };
        // This `describe` evaluates and memorizes the
        // descriptions present in student's code.
        function _describe (msg, fn) {
            let desc = { msg: msg, fn: fn, description: undefined };
            config.student.tests.push(desc);
            function fnx () {
                /*jshint validthis:true */
                desc.description = this;
                return fn.call(this);
            }
            desc.description = yasmini.original_describe(msg, fnx);
            return desc.description;
        }
        let src = fs_readFileSync(codefile, 'UTF8');
        // Prepare the global environment where will be evaluated
        // the student's code. The students should not alter these
        // global variables but they may use them to write their own tests:
        defaultCurrentGlobal.describe = _describe;
        Object.assign(global, defaultCurrentGlobal);

        let exports = '';
        for (let fname in config.functions) {
            exports += `  if ( typeof ${fname} !== 'undefined' ) { require.exports.${fname} = ${fname}; }\n`;
        }
        src = `(function (require, global) {
${src}

${exports}
});
        `;

        // Student's functions will be stored in result and result
        // is stored as require.exports:
        let result = {};
        try {
            // Evaluate student's code in the current global environment:
            let studentFunction =
                vm.runInThisContext(src, { displayErrors: true });
            yasmini.trace("after student's code function definition");
            yasmini.require.exports = result;
            studentFunction(yasmini.require, global);
            yasmini.trace("after invoking student's code function");

            // Check that student's code is coherent wrt its own tests:
            let coherent = true;
            config.student.tests.forEach(function (d) {
                // FIXME d.description might be not yet fulfilled!!!!!!!!!
                coherent = coherent && d.description.pass;
            });
            if ( config.student.tests.length > 0 && ! coherent ) {
                yasmini.verbalize("--", yasmini.messagefn('failOwnTests'));
                result = undefined;
            }

            // Check that all required student's functions are present:
            if ( result && ! config.dontCheckFunctions ) {
                yasmini.trace("Checking extractions");
                for (let fname in config.functions) {
                    //let f = global[fname];
                    yasmini.trace(`Checking extraction ${fname}`);
                    let f = result[fname];
                    if ( typeof f === 'function' ||
                         f instanceof Function ) {
                        let msg = yasmini.messagefn('isAFunction', fname);
                        yasmini.verbalize("+", msg);
                    } else {
                        let msg = yasmini.messagefn('notAFunction', fname);
                        yasmini.verbalize("-", msg);
                        result = undefined;
                    }
                }
            }
            // result is the hash of student's function or undefined:
            //yasmini.trace(`Student result: ${yasmini.makeAsPRE(util.inspect(result))}`);
            resolve(result);
        } catch (exc) {
            // Bad syntax or incorrect compilation throw an Error
            var msg = yasmini.messagefn('notSatisfying', exc);
            msg = msg.replace(/\n/gm, "\n#");
            yasmini.verbalize("--", msg);
            resolve(undefined);
        }
        resolve(result);
    });
};

/**
 * verbalize some facts. The first argument qualifies the verbalization.
 * -- means error
 * -  is for warning
 * +  is for positive information, feedback

 * @param string        kind of message
 * @param Any...        message fragments
 */
yasmini.verbalize = function (kind) {
    let result = kind + ' ';
    if ( kind === '##' && process && process.uptime ) {
        result += process.uptime() + ' ';
    }
    for (let i=1 ; i<arguments.length ; i++) {
      var item = arguments[i];
      if ( item instanceof String || typeof item === 'string' ) {  
          result += item;
      } else {
          let s = he.encode(yasmini.imports.util.inspect(arguments[i]));
          result += s;
      }
    }
    yasmini.config.journal.push(result);
    yasmini.printPartialResults_();
};

/** 
 * Record the current state of the tests in a file. This is needed by
 * CodeGradX since tests might be interrupted abruptly if lasting too
 * long. In that case, we want to know how far we tested.
 */
yasmini.printPartialResults_ = function () {
    // Recompute attemptedExpectationsCount and succeededExpectationsCount:
    yasmini.config.attemptedExpectationsCount = 0;
    yasmini.config.succeededExpectationsCount = 0;
    yasmini.config.descriptions.forEach(function (desc) {
      yasmini.config.attemptedExpectationsCount += desc.expectationAttempted;
      yasmini.config.succeededExpectationsCount += desc.expectationSuccessful;
    });
    var msg = "" +
    "ATTEMPTEDEXPECTATIONSCOUNT=" +
    yasmini.config.attemptedExpectationsCount +
    "\nSUCCEEDEDEXPECTATIONSCOUNT=" +
    yasmini.config.succeededExpectationsCount +
    "\nTOTALEXPECTATIONSCOUNT=" +
    yasmini.config.totalExpectationsCount;
    yasmini.config.journal.forEach(function (s) {
      msg += "\n# " + s;
    });
    msg += "\n";
    fs_writeFileSync(yasmini.config.resultFile, msg);
 };

/* Mark student's code.
 * Stop at first failure.
 */

yasmini.markFile = function (config, codefile, specfile) {
    // Make it() global to this module:
    yasmini.config = config;

    // Check student's code with its own tests (if any):
    function postEvalStudentCode (things) {
        yasmini.verbalize("##", `after evalStudentCode: ${things}`);
        if ( things ) {
            yasmini.verbalize("+", yasmini.messagefn('finishEval'));
            return evalStudentTests_(config, specfile, things)
                .catch(function (exc) {
                    yasmini.verbalize("##",
                      'catch after evalStudentTests: ' + exc);
                    return false;
                })
                .then(postStudentTests);
        } else {
            yasmini.verbalize("-", yasmini.messagefn('stopEval'));
            return false;
        }
    }
    function postStudentTests (bb) {
        yasmini.verbalize("##", `after evalStudentTests: ${bb}`);
        if ( bb ) {
            yasmini.verbalize("-", yasmini.messagefn('stopEval'));
        }
        return bb;
    }
    // Catch error in postEvalStudentCode (if any):
    function catchRemains (reason) {
        yasmini.verbalize("##", 'catchRemains: ' + reason);
    }
    yasmini.verbalize("##", 'before evalStudentCode');
    return evalStudentCode_(config, codefile)
        .catch(function (reason) {
            yasmini.verbalize("##", 'catch after evalStudentCode ' + reason);
            return false;
        })
        .then(postEvalStudentCode)
        .catch(catchRemains);
};

// Verbalization

yasmini.class.Expectation.prototype.beginHook = function () {
    yasmini.trace(`running Expectation.beginHook id=${this.id}`);
    // exitCode is initially undefined. We initialize it with 0 as soon
    // as at least one expectation is to be processed:
    if ( ! yasmini.config.exitCode ) {
        yasmini.config.exitCode = 0;
    }
    this.alreadyShownTest = false;
    // Run the endHook of the previous expectation if any:
    let n = this.specification.expectations.length;
    if ( n > 1 ) {
        let previousExpectation = this.specification.expectations[n-2];
        previousExpectation.endHook();
    }
    this.update_();
    yasmini.printPartialResults_();
    this.displayHook();
};

yasmini.class.Expectation.prototype.displayHook = function () {
    yasmini.trace(`running Expectation.displayHook id=${this.id}`);
    var msg;
    if ( ! this.alreadyShownTest ) {
        if ( this.verbose ) {
            msg = 'Test #' + this.index + ' ';
        }
        if ( this.code ) {
            msg = (msg || '') + yasmini.messagefn('startEval', this.code);
        }
        if (msg) {
            yasmini.verbalize('+', msg);
        }
        this.alreadyShownTest = true;
    }
};

yasmini.class.Expectation.prototype.matchHook = function () {
    yasmini.trace(`running Expectation.matchHook id=${this.id}`);
    this.displayHook();
};

yasmini.class.Expectation.prototype.endHook = function () {
    yasmini.trace(`running Expectation.endHook id=${this.id} runEndHook=${this.runEndHook}, pass=${this.pass}`);
    var msg;
    if ( ! this.runEndHook ) {
        if (this.pass) {
            msg = yasmini.messagefn('bravo');
            yasmini.verbalize('++', msg);
        } else {
            if ( this.raisedException ) {
                msg = yasmini.messagefn(
                    'failException', this.index, this.exception);
            } else {
                msg = yasmini.messagefn('fail', this.index, this.actual);
            }
            yasmini.verbalize('--', msg);
        }
        this.runEndHook = true;
    }
    this.update_();
    yasmini.printPartialResults_();
};

yasmini.class.Specification.prototype.beginHook = function () {
    yasmini.trace(`running Specification.beginHook id=${this.id}`);
    let msg = this.message;
    yasmini.verbalize('+', msg);
    this.update_();
    yasmini.printPartialResults_();
};

yasmini.class.Specification.prototype.endHook = function () {
    yasmini.trace(`running Specification.endHook id=${this.id}`);
    this.update_();
    yasmini.printPartialResults_();
    var msg;
    if (this.pass) {
        // Here expectationAttempted = expectationIntended
        msg = "+ " + yasmini.messagefn('fullSuccess', 
                                       this.expectationSuccessful, 
                                       this.expectationAttempted);
    } else {
        msg = "- " + yasmini.messagefn(
            'partialSuccess',
            this.expectationSuccessful,
            this.expectationIntended ?
                this.expectationIntended :
                this.expectationAttempted );
    }
    yasmini.verbalize(msg);
};

yasmini.class.Description.prototype.beginHook = function () {
    yasmini.trace(`running Description.beginHook id=${this.id}`);
    yasmini.config.descriptions.push(this);
    let msg = yasmini.messagefn('checkFunction', this.message);
    yasmini.verbalize("+", msg);
    this.update_();
    yasmini.printPartialResults_();
};

yasmini.class.Description.prototype.endHook = function () {
    yasmini.trace(`running Description.endHook id=${this.id}`);
    this.update_();
    yasmini.printPartialResults_();
};

    // Don't pollute the global environment
})();

// end of codegraxmarker.js
