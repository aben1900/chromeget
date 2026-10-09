'use strict';
const {migrateSettings,validId}=require('./ai-config-model.cjs');
const upgradeSettings=(value,credentialGroups)=>migrateSettings(value,credentialGroups).settings;
module.exports={upgradeSettings,validId};
