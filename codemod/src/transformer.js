const { types } = require('recast');
const { transform: lebabTransform } = require('lebab');

const Files = require('./files');

const { collectIdentifiers, collectClassesDeclaration } = require('./collector');

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

const transformerClassDeclaration = function (fileAST) {
  const listClasses = Array.from(collectClassesDeclaration(fileAST))

  listClasses.forEach(classNode => {    
    const className = classNode.value.id.name;
    Files.setNodeItem(className, classNode.value)

    classNode.parentPath.value.forEach(node => { 
      if (node.type === 'ExpressionStatement') {
        transformerExpressionStatement(node, className);
      }
    });
  })  
}

const transformerExpressionStatement = function (item, className) {
  const leftToken = item.expression.left.object;

  if (!leftToken) { return transformerGlobal(item) }

  const name = leftToken.name || leftToken.object.name;
  className === name && Files.setNodeItem(name, item)
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

const transformNodeType = nodeAST => {
  const nodeTypeTransformer = ExecuteTransformerMap[nodeAST.type];

  return nodeTypeTransformer && nodeTypeTransformer(nodeAST);
}

module.exports = {
  transformNodeType,
  transformES6,
  transformerClassDeclaration
}
