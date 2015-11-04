(function() {
	'use strict';

	var log = require(process.cwd() + '/build/server/logging.js').getLogger('handlers/RequestChangedHandler.js');
	var universalDaoModule = require(process.cwd() + '/build/server/UniversalDao.js');
	var dateUtils = require(process.cwd() + '/build/server/DateUtils.js').DateUtils;
	var QueryFilter = require(process.cwd() + '/build/server/QueryFilter.js');

	var nodemailer = module.parent.require('nodemailer');
	var renderModule = module.parent.require('./renderService.js');
	var transport = nodemailer.createTransport('Sendmail');

	var TRANS_OFFICER_REQ_COLLECTION = 'transferRequestsOfficer';
	var SEC_PROFILES_COLLECTION = 'securityProfiles';

	var KM_PROFILE_NAME = 'Klubový manažér';

	/**
	*	@module server
	*	@submodule event.handler
	*	@class RequestChangedHandler
	*/
	function RequestChangedHandler(ctx) {
		this.ctx = ctx;
		var self = this;
		var renderService = new renderModule.RenderService();



		var userDao = new universalDaoModule.UniversalDao(
			this.ctx.mongoDriver,
			{collectionName: 'people'}
		);

		/**
			Method handles <b>event-request-created<b> event.
			<br>Method does:
			<li>updates/initializes requests attributes setupDate,applicant,status,assignedTo</li>
			<li>sends notification mail to cfg defined issue solver ('requestSolverAddress') </li>
			<br>
			Limitations: requestSolverAddress should match to systemCredentials.login.email of any user othewise attribute 'assignedTo' is not resolved.

			@method handleRequestCreated

		*/
		this.handleRequestCreated = function(event, collection) {

			var entity = event.entity;
			var solverAddress = this.ctx.config.mails.requestSolverAddress;

			var requestsDao = new universalDaoModule.UniversalDao(
			this.ctx.mongoDriver,
			{collectionName: collection}
			);

			// console.log('mmmmmmmmmmmmmm: ' + JSON.stringify(event));

			if(!entity.requestData) {
				entity.requestData = {};
			}
			entity.requestData.setupDate = dateUtils.nowToReverse();
			entity.requestData.status = 'created';
			entity.requestData.applicant = {schema: 'uri://registries/people#views/fullperson-km/view', registry: 'people', oid: event.user.id};

			if (event.user && event.user.officer && event.user.officer.club) {
				entity.requestData.clubApplicant = {
					schema: 'uri://registries/organizations#views/club-km/view',
					oid: event.user.officer.club.oid
				};
			} else {
				log.warn('Applicant %s does not have assigned club as officer but should have', event.user.id);
			}

			var qf = QueryFilter.create();
			qf.addCriterium('systemCredentials.login.email', 'eq', solverAddress);

			userDao.find(qf, function(err, data) {
				if (err) {
					log.error(err);
					return;
				}

				// assign to and send mail.
				if (data.length === 1) {
					var solver = data[0];
					entity.requestData.assignedTo = {schema: 'uri://registries/people#views/fullperson-km/view', oid: solver.id};
				} else {
					log.warn('Failed to find solver with configured email %s in database, request left withoud solver', solverAddress);
				}
				self.sendRequestCreated(solverAddress, self.ctx.config.webserverPublicUrl, event.user.baseData.name.v + ' ' + event.user.baseData.surName.v, entity.requestData.subject, self.ctx.config.serviceUrl + '/requests/' + entity.id);

				requestsDao.save(entity, function(err2) {
					if (err2) {
						log.error(err2);
						return;
					}
					log.debug('requests created: event handled');
				});
			});

			if(event.eventType === 'event-transfer-request-officer-created'){
				self.notifyKMs(event);
			}

		};

		/**
			Method handles <b>event-request-updated</b>
			@method handleRequestModified
		*/
		this.handleRequestModified = function(event) {

			var entity = event.entity;
			// var solverAddress=this.ctx.config.mails.requestSolverAddress;

			// if (entity.requestData) {

			entity.requestData.applicant = {schema: 'uri://registries/people#views/fullperson/view', registry: 'people', oid: event.user.id};
			if (entity.requestData.assignedTo) {
				userDao.get(entity.requestData.assignedTo.oid, function(err, solver) {
						if (err) {
							log.error(err);
							return;
						}

						// assign to and send mail.
						if (solver) {
							self.sendRequestModified(solver.systemCredentials.login.email, self.ctx.config.webserverPublicUrl, event.user.baseData.name.v + ' ' + event.user.baseData.surName.v, entity.requestData.subject, self.ctx.config.serviceUrl + '/requests/' + entity.id);
						}
					});

			} else {
				self.sendRequestModified(this.ctx.config.mails.requestSolverAddress, self.ctx.config.webserverPublicUrl, event.user.baseData.name.v + ' ' + event.user.baseData.surName.v, entity.requestData.subject, self.ctx.config.serviceUrl + '/requests/' + entity.id);
			}

			if (entity.requestData.applicant) {
				userDao.get(entity.requestData.applicant.oid, function(err, applicant) {
						if (err) {
							log.error(err);
							return;
						}
						self.sendRequestModified(applicant.systemCredentials.login.email, self.ctx.config.webserverPublicUrl, event.user.baseData.name.v + ' ' + event.user.baseData.surName.v, entity.requestData.subject, self.ctx.config.serviceUrl + '/requests/' + entity.id);
					});
			}

			if(event.eventType === 'event-transfer-request-officer-updated'){
				self.notifyKMs(event);
			}
		};

		this.notifyKMs = function(event){
			var securityProfileDao = new universalDaoModule.UniversalDao(
				this.ctx.mongoDriver,
				{collectionName: SEC_PROFILES_COLLECTION}
			);

			var transferRequestsOfficerDao = new universalDaoModule.UniversalDao(
				this.ctx.mongoDriver,
				{collectionName: TRANS_OFFICER_REQ_COLLECTION}
			);

			transferRequestsOfficerDao.get(event.entity.id , function(err, data){
				if (err) {
					log.error(err);
					return;
				}

				if (data.transferData && data.transferData.clubFrom && data.transferData.clubTo){
					var clubFromOid = data.transferData.clubFrom.oid;
					var clubToOid = data.transferData.clubTo.oid;
				}else{
					log.error('Request doesn\'t contain necessary club info.');
					return;
				}

				var qf = QueryFilter.create();

				//Find KM profile ID
				qf.addCriterium('baseData.name', 'eq', KM_PROFILE_NAME);
				qf.addField('id');
				securityProfileDao.find(qf, function(err2, data){
					if (err2) {
						log.error(err2);
						return;
					}

					//Find KMs affiliated with the clubs
					if (data.length === 1) {
						var kmID = data[0].id;
						var recipients = [];

						var qf = QueryFilter.create();
						qf.addField('contactInfo.email');
						qf.addCriterium('systemCredentials.profiles', 'eq', kmID);
						qf.addCriterium('officer.club.oid', 'in', [clubFromOid, clubToOid]);
						qf.addCriterium('contactInfo.email', 'ex');
						userDao.find(qf, function(err3, data){
							if (err3){
								log.error(err3);
								return;
							}

							if (data.length > 0){
								data.forEach(function(user){
									recipients.push(user.contactInfo.email);
								});

								var strRecipients = recipients.join(', ');

								if (event.eventType === 'event-transfer-request-officer-created'){
									self.sendRequestCreated(strRecipients, self.ctx.config.webserverPublicUrl,
										event.user.baseData.name.v + ' ' + event.user.baseData.surName.v);
								}else if (event.eventType === 'event-transfer-request-officer-updated'){
									self.sendRequestModified(strRecipients, self.ctx.config.webserverPublicUrl,
										event.user.baseData.name.v + ' ' + event.user.baseData.surName.v);
								}
							}
						});
					}else {
						log.error('Can\'t find ID of the KM profile');
					}
				});
				
			});
		};


		this.sendRequestCreated = function(email, serviceUrl, applicant, subject, requestUri) {
			var mailOptions = {
				from: this.ctx.config.mails.requestNotifSender,
				to: email,
				subject: '[' + serviceUrl + '] Nová žiadosť',
				html: renderService.render(renderModule.templates.REQUEST_CREATED_HTML, {applicant: applicant, subject: subject, serviceUrl: serviceUrl, requestUri: requestUri})
			};

			log.verbose('Sending mail ', mailOptions);

			transport.sendMail(mailOptions);


		};
		this.sendRequestModified = function(email, serviceUrl, modifier, subject, requestUri) {

			var mailOptions = {
				from: this.ctx.config.mails.requestNotifSender,
				to: email,
				subject: '[' + serviceUrl + '] Upravená žiadosť',
				html: renderService.render(renderModule.templates.REQUEST_UPDATED_HTML, {modifier: modifier, subject: subject, serviceUrl: serviceUrl, requestUri: requestUri})
			};

			log.verbose('Sending mail ', mailOptions);

			transport.sendMail(mailOptions);
		};

	}
	/**
	* method dispatch all types of registered events to actual handling method.
	* @method handle
	*/
	RequestChangedHandler.prototype.handle = function(event) {
		log.info('handle called', event, RequestChangedHandler.prototype.ctx);

		if (event.eventType === 'event-transfer-request-officer-created') {
			this.handleRequestCreated(event, TRANS_OFFICER_REQ_COLLECTION);
		}else if(event.eventType === 'event-transfer-request-officer-updated') {
			this.handleRequestModified(event, TRANS_OFFICER_REQ_COLLECTION);
		}
	};

	RequestChangedHandler.prototype.getType = function() {
		return ['event-transfer-request-officer-created', 'event-transfer-request-officer-updated'];
	};

	module.exports = function( ctx) {
		return new RequestChangedHandler(ctx );
	};
}());
