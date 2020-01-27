const { types } = require('recast');

const Files = require('./files');
const Utils = require('./utils');

function transformerVariableDeclaration(item) {
  if (item.kind === 'const') {
    return Files.setNodeItem('Constants', item)
  } else {
    return transformerGlobal(item)
  }
}

function transformerUtils(item) {
  Files.setNodeItem('Utils', item)
}

function transformerClassDeclaration(item) {
  Files.setNodeItem(item.id.name, item)
}

function transformerExpressionStatement(item) {
  const leftToken = item.expression.left.object;

  if (!leftToken) { return transformerGlobal(item) }

  const name = leftToken.name || leftToken.object.name;

  Files.setNodeItem(name, item)
}

function transformerGlobal(item) {
  return Files.setNodeItem('Global', Utils.collectIdentifiers(item))
}

const TransformerMap = {
  VariableDeclaration: transformerVariableDeclaration,
  FunctionDeclaration: transformerUtils,
  ClassDeclaration: transformerClassDeclaration,
  ExpressionStatement: transformerExpressionStatement,
  Global: transformerGlobal
}

module.exports = TransformerMap