const util = require('../util');
const mobilecommons = require('../mobilecommons');

const Group = require('../group');

const apiKey = process.env.API_KEY;
const environments = ['local', 'thor', 'production'];

module.exports = router => {

  // API key check
  router.use((req, res, next) => {
    if (req.headers['x-gambit-group-api-key'] !== apiKey) {
      return res.send('Invalid API key').status(403);
    }
    return next();
  });

  router.get('/group/:campaignId/:campaignRunId', function (req, res) {
    // Validate request
    if (!util.validate(['campaignId', 'campaignRunId'], req.params)) {
      res.send('Missing parameters').status(400);
      return;
    }

    const campaignId = req.params.campaignId;
    const campaignRunId = req.params.campaignRunId;

    // Check if we already have an entry for this campaign run.
    Group.findOne({campaign_id: campaignId, campaign_run_id: campaignRunId}, (err, group) => {
      if (err) {
        res.send('DB error').status(500);
        return;
      }

      if (!group) {
        res.send('No group for this campaign id & run id exists.').status(404);
        return;
      }

      res.json(group);
    });
  });

  router.post('/group', function (req, res) {
    // Validate request
    if (!util.validate(['campaign_id', 'campaign_run_id'], req.body)) {
      res.send('Missing parameters').status(400);
      return;
    }

    const campaignId = req.body.campaign_id;
    const campaignRunId = req.body.campaign_run_id;

    // Check if we already have an entry for this campaign run.
    Group.find({campaign_id: campaignId, campaign_run_id: campaignRunId}, (err, groups) => {
      if (err) {
        res.send('DB error').status(500);
        return;
      }

      if (groups.length > 0) {
        res.send('A group for this campaign id & run id exists already.').status(400);
        return;
      }

      // Create a new group with campaign id's.
      const group = new Group({campaign_id: campaignId, campaign_run_id: campaignRunId});

      /**
       * Update this requests group with given mobile commons data.
       * @param  {object} res Parsed mobile commons response.
       * @param  {string} env The environment this is targetting.
       */
      function updateGroupData(res, env) {
        if (!res || !res.response.group) {
          return;
        }

        const mcGroup = res.response.group;
        const id = mcGroup[0]['$'].id;
        group.mobilecommons_groups[env] = id;
      }

      // There is probably a dynamic way of doing this, but this works for now.
      // For each environment, create a group in mobile commons & save the ID.
      mobilecommons.createGroup(util.groupKeyGen(campaignId, campaignRunId, 'local'))
      .then(mcRes => updateGroupData(mcRes, 'local'))
      .then(() => mobilecommons.createGroup(util.groupKeyGen(campaignId, campaignRunId, 'thor')))
      .then(mcRes => updateGroupData(mcRes, 'thor'))
      .then(() => mobilecommons.createGroup(util.groupKeyGen(campaignId, campaignRunId, 'production')))
      .then(mcRes => updateGroupData(mcRes, 'production'))
      .then(() => {
        // Save the group & return it in the response.
        group.save();
        res.json(group);
      })
      .catch(err => {
        console.error(err)
        res.send('Server error').status(500);
      });
    });
  });

}