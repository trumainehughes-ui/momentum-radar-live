import test from 'node:test';
import assert from 'node:assert/strict';
import {nflModelOnlySkillRoleEligible as eligible} from '../lib/nfl-model-only-skill-role.js';
const role={recommendationEligible:true,gameModelOnly:true,starterVerified:false,confirmedStarter:false,roleConfidence:'CONDITIONAL_DAY_AHEAD',starterStatus:'PROJECTED_HIGH_USAGE_ROLE',availability:'UNREPORTED',verification:{role:{verified:false}}};
test('conditional research role is accepted',()=>assert.equal(eligible(role),true));
test('injured roles are rejected',()=>{for(const availability of ['OUT','INACTIVE','IR','QUESTIONABLE','DOUBTFUL','UNKNOWN'])assert.equal(eligible({...role,availability}),false);});
test('unverified rotation and missing evidence rejected',()=>{for(const patch of [{recommendationEligible:false},{gameModelOnly:false},{starterStatus:'UNVERIFIED_ROLE'},{confirmedStarter:true}])assert.equal(eligible({...role,...patch}),false);});
