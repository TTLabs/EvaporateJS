const { types } = require('recast');
const { transform: lebabTransform } = require('lebab');

const Files = require('./files');

const { collectIdentifiers } = require('./collector');

const Constants = require('./constants');

const transformerVariableDeclaration = function (item) {
  if (item.kind === 'const') {
    return Files.setNodeItem('Constants', item)
  } else {
    return transformerGlobal(item)
  }
}

const transformerUtils = function (item) {
  Files.setNodeItem('Utils', item)
}

const transformerClassDeclaration = function (item) {
  Files.setNodeItem(item.id.name, item)
}

const transformerExpressionStatement = function (item) {
  const leftToken = item.expression.left.object;

  if (!leftToken) { return transformerGlobal(item) }

  const name = leftToken.name || leftToken.object.name;

  Files.setNodeItem(name, item)
}

const transformerGlobal = function (item) {
  return Files.setNodeItem('Global', collectIdentifiers(item))
}

const transformES6 = function (rawCode) {
  const result = lebabTransform(rawCode, Constants.TransformsToApply);

  return result.code;
}

const ExecuteTransformerMap = {
  VariableDeclaration: transformerVariableDeclaration,
  FunctionDeclaration: transformerUtils,
  ExpressionStatement: transformerExpressionStatement,
  Global: transformerGlobal
}

module.exports = {
  ExecuteTransformerMap,
  transformES6,
  transformerClassDeclaration
}
