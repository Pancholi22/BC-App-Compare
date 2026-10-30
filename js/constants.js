'use strict';

/* ---------- object types ---------- */
const TYPE_INFO = [
  ['table','Table','Tables'],['tableextension','Table extension','Table extensions'],
  ['page','Page','Pages'],['pageextension','Page extension','Page extensions'],['pagecustomization','Page customization','Page customizations'],
  ['codeunit','Codeunit','Codeunits'],['report','Report','Reports'],['reportextension','Report extension','Report extensions'],
  ['query','Query','Queries'],['xmlport','XmlPort','XmlPorts'],['enum','Enum','Enums'],['enumextension','Enum extension','Enum extensions'],
  ['interface','Interface','Interfaces'],['controladdin','Control add-in','Control add-ins'],
  ['permissionset','Permission set','Permission sets'],['permissionsetextension','Permission set extension','Permission set extensions'],
  ['profile','Profile','Profiles'],['profileextension','Profile extension','Profile extensions'],['entitlement','Entitlement','Entitlements'],
  ['other','AL file','Other AL files'],['file','File','Other files']
];
const TYPE = Object.fromEntries(TYPE_INFO.map((t, i) => [t[0], { order: i, one: t[1], many: t[2] }]));
const SYM_TYPES = {
  Tables:'table', TableExtensions:'tableextension', Pages:'page', PageExtensions:'pageextension', PageCustomizations:'pagecustomization',
  Codeunits:'codeunit', Reports:'report', ReportExtensions:'reportextension', Queries:'query', XmlPorts:'xmlport',
  EnumTypes:'enum', EnumExtensionTypes:'enumextension', Interfaces:'interface', ControlAddIns:'controladdin',
  PermissionSets:'permissionset', PermissionSetExtensions:'permissionsetextension', Profiles:'profile', ProfileExtensions:'profileextension', Entitlements:'entitlement'
};
const OBJ_RE = /^﻿?(tableextension|table|pageextension|pagecustomization|page|codeunit|reportextension|report|xmlport|query|enumextension|enum|interface|permissionsetextension|permissionset|controladdin|profileextension|profile|entitlement)\b[ \t]+(?:(\d+)[ \t]+)?("(?:[^"\r\n]|"")*"|[A-Za-z_]\w*)/gim;
const BIN_RE = /\.(zip|png|jpe?g|gif|bmp|ico|dll|exe|pdf|woff2?|ttf|otf|eot|navx|app|bin|mp4|svgz|docx?|xlsx?|xlsm|pptx?)$/i;
const STATUS = ['added','removed','modified','same'];
const GLYPH = { added:'+', removed:'−', modified:'≠', same:'=' };
const LABEL = { added:'Added', removed:'Removed', modified:'Modified', same:'Same' };
