"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rules = void 0;
/** test if one range is inside another, used to see if variable in scope */
function isInsideRange(outer, inner) {
    return outer[0] <= inner[0] && inner[1] <= outer[1];
}
/** summarize an array of variables for reporting */
function summarizeVariables(variables) {
    const sortedNames = [...variables].map((v) => v.name).sort();
    if (sortedNames.length > 4) {
        sortedNames.splice(2, sortedNames.length - 3, "...");
    }
    return sortedNames.join(", ");
}
const noClosures = {
    meta: {
        type: "problem",
        docs: {
            description: "disallow closing around variables in any function",
            category: "Variables",
            recommended: false,
            url: "https://github.com/tjwds/eslint-plugin-no-closure",
        },
        messages: {
            reference: "reference to variable {{ variable }} in function",
            function: "function closes variables: {{ variables }}",
            declaration: "declared variable {{ variable }} referenced in a function",
        },
        schema: [
            {
                type: "object",
                properties: {
                    declaration: { enum: ["always", "never"] },
                    function: { enum: ["always", "never"] },
                    reference: { enum: ["always", "never"] },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const sourceCode = context.getSourceCode();
        const manager = sourceCode.scopeManager;
        // all closed definitions to report
        const closedDefinitions = new Set();
        // all closed functions to report
        const closedFuncs = new Map();
        const [{ declaration: reportDeclarations = "always", function: reportFunctions = "always", reference: reportReferences = "always", } = {},] = context.options;
        /** the generic check function */
        function checkFunction(node) {
            // get the function scope
            const functionScope = manager.acquire(node);
            const funcRange = node.range;
            if (!functionScope || !funcRange) {
                return;
            }
            // all variables that this scope closes
            const closedVariables = new Set();
            // iterate through all references in all scopes looking for a reference
            // to an upper scope
            const queue = [functionScope];
            let scope;
            while ((scope = queue.pop())) {
                queue.push(...scope.childScopes);
                for (const ref of scope.references) {
                    const variable = ref.resolved;
                    if (!variable)
                        continue; // no definition, so can't close
                    const closedDefs = new Set(variable.defs.filter(
                    // last check ignores typescript type closures
                    (def) => !isInsideRange(funcRange, def.node.range) &&
                        def.type !== "Type"));
                    if (!closedDefs.size)
                        continue; // not closed
                    // report immediate reference
                    reportReferences === "always" &&
                        context.report({
                            node: ref.identifier,
                            messageId: "reference",
                            data: { variable: variable.name },
                        });
                    // store function reference
                    reportFunctions === "always" && closedVariables.add(variable);
                    // store definitions
                    if (reportDeclarations === "always") {
                        for (const def of closedDefs)
                            closedDefinitions.add(def);
                    }
                }
            }
            // if we closed some variables, record that for the function
            if (closedVariables.size) {
                closedFuncs.set(node, closedVariables);
            }
        }
        return {
            ArrowFunctionExpression: checkFunction,
            FunctionDeclaration: checkFunction,
            FunctionExpression: checkFunction,
            "Program:exit"() {
                // report functions
                for (const [func, vars] of closedFuncs.entries()) {
                    context.report({
                        node: func,
                        messageId: "function",
                        data: {
                            variables: summarizeVariables(vars.keys()),
                        },
                    });
                }
                // report definitions
                for (const def of closedDefinitions) {
                    context.report({
                        node: def.node,
                        messageId: "declaration",
                        data: { variable: def.name.name },
                    });
                }
            },
        };
    },
};
exports.rules = {
    "no-closures": noClosures,
};
