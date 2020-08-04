const fs = require('fs')
const path = require('path')
const typewiz = require('typewiz-core')

const sourceDir = './output';

const files = fs.readdirSync(sourceDir);

const getFile = (fileName) => {
  const filePath = path.resolve(sourceDir, fileName);
  const source = fs.readFileSync(filePath).toString();

  return { source, filePath };
}

const instrumentFile = ({ source, filePath }) => {
  const instrumentedSource = typewiz.instrument(source, filePath)

  return { source: instrumentedSource, filePath };
}

const outputFile = ({ source, filePath }) => fs.writeFileSync(filePath, source);

files
  .map(getFile)
  .map(instrumentFile)
  .forEach(outputFile)

