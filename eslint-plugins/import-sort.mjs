// Para aplicar este plugin e corrigir todos os imports automaticamente, rode:
// npx eslint . --fix

function classifyImport(node) {
  const specifiers = node.specifiers || [];

  if (specifiers.length === 0) {
    return "side-effect";
  }

  const hasDefault = specifiers.some((specifier) => {
    return specifier.type === "ImportDefaultSpecifier";
  });
  const hasNamed = specifiers.some((specifier) => {
    return specifier.type === "ImportSpecifier";
  });
  const hasNamespace = specifiers.some((specifier) => {
    return specifier.type === "ImportNamespaceSpecifier";
  });

  if (hasNamespace) {
    return "default";
  }

  if (hasDefault && hasNamed) {
    return "mixed";
  }

  if (hasDefault) {
    return "default";
  }

  return "named";
}

function getImportText(sourceCode, node) {
  return sourceCode.getText(node);
}

function getLineLength(sourceCode, node) {
  return getImportText(sourceCode, node).length;
}

function getContiguousImportGroups(body) {
  const groups = [];
  let currentGroup = [];

  for (const node of body) {
    if (node.type === "ImportDeclaration") {
      currentGroup.push(node);
      continue;
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

function sortImportGroup(sourceCode, importNodes) {
  const sideEffects = importNodes.filter((node) => {
    return classifyImport(node) === "side-effect";
  });
  const defaultImports = importNodes.filter((node) => {
    return classifyImport(node) === "default";
  });
  const mixedImports = importNodes.filter((node) => {
    return classifyImport(node) === "mixed";
  });
  const namedImports = importNodes.filter((node) => {
    return classifyImport(node) === "named";
  });

  const sortByLength = (a, b) => {
    return getLineLength(sourceCode, a) - getLineLength(sourceCode, b);
  };

  return [
    ...sideEffects,
    ...[...defaultImports].sort(sortByLength),
    ...[...mixedImports].sort(sortByLength),
    ...[...namedImports].sort(sortByLength),
  ];
}

const rule = {
  meta: {
    type: "layout",
    docs: {
      description:
        "Enforce import ordering: default (by length) -> mixed -> named (by length), no blank lines",
    },
    fixable: "code",
    schema: [],
    messages: {
      incorrectOrder: "Imports are not ordered correctly.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    return {
      Program(node) {
        const groups = getContiguousImportGroups(node.body);

        for (const importNodes of groups) {
          if (importNodes.length <= 1) {
            continue;
          }

          const sorted = sortImportGroup(sourceCode, importNodes);
          const currentTexts = importNodes.map((importNode) => {
            return getImportText(sourceCode, importNode);
          });
          const expectedTexts = sorted.map((importNode) => {
            return getImportText(sourceCode, importNode);
          });

          const orderCorrect = currentTexts.every((text, index) => {
            return text === expectedTexts[index];
          });

          let hasBlankLines = false;

          for (let index = 0; index < importNodes.length - 1; index += 1) {
            const currentEnd = importNodes[index].loc.end.line;
            const nextStart = importNodes[index + 1].loc.start.line;

            if (nextStart - currentEnd > 1) {
              hasBlankLines = true;
              break;
            }
          }

          if (orderCorrect && !hasBlankLines) {
            continue;
          }

          context.report({
            node: importNodes[0],
            messageId: "incorrectOrder",
            fix(fixer) {
              const firstImport = importNodes[0];
              const lastImport = importNodes[importNodes.length - 1];
              const rangeStart = firstImport.range[0];
              const rangeEnd = lastImport.range[1];
              const newImportBlock = expectedTexts.join("\n");

              return fixer.replaceTextRange(
                [rangeStart, rangeEnd],
                newImportBlock,
              );
            },
          });
        }
      },
    };
  },
};

const plugin = {
  meta: {
    name: "eslint-plugin-import-sort",
    version: "1.0.0",
  },
  rules: {
    order: rule,
  },
};

export default plugin;
