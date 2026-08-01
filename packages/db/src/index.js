const prisma = require('@prisma/client');
const searchText = require('./search-text');

module.exports = { ...prisma, ...searchText };
