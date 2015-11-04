(function() {
	'use strict';

	var log = require(process.cwd() + '/build/server/logging.js').getLogger('manglers/TransferHandler.js');
	var objectTools = require(process.cwd() + '/build/server/ObjectTools.js');
	var universalDaoModule = require(process.cwd() + '/build/server/UniversalDao.js');
	var dateUtils = require(process.cwd()+'/build/server/DateUtils.js').DateUtils;
	var QueryFilter = require(process.cwd()+'/build/server/QueryFilter.js');

	function TransferHandler(ctx) {
		this.ctx=ctx;
		var self=this;

		this.handleTransferChange=function(event){

			var entity = event.entity;

			var eventScheduler = this.ctx.eventScheduler;

			eventScheduler.unscheduleEvents(entity.id,null,function(err,data){
				if (err){log.error('unschedule',err);}

				if (entity.baseData.stateOfTransfer === 'schválený') {

					if (entity.baseData.typeOfTransfer === 'hosťovanie' ){

						var tsFrom = dateUtils.strToTS(entity.baseData.dateFrom);
						var tsTo = dateUtils.strToTS(entity.baseData.dateTo);

						if (tsFrom<tsTo){
							eventScheduler.scheduleEvent(tsFrom,'event-hosting-start-officer',{transferId:entity.id},[entity.id],function(err,data){
								if (err){
									log.err(err);
									return;
								}
								//FIXME: temporary solution for race condition
								var now= new Date().getTime();
								if (tsTo< now){
									tsTo=now+1000;
								}

								eventScheduler.scheduleEvent(tsTo,'event-hosting-end-officer',{transferId:entity.id},[entity.id],function(err,data){
									if (err){
										log.err(err);
										return;
									}
									log.debug('new events for transfer scheduled');
								} );
							} );

						}else {
							self.ctx.eventRegistry.emitProcesingError('Neplatný časový rozsah. Transfer nebol vykonaný.',event);
						}

					}
					else if (entity.baseData.typeOfTransfer === 'prestup' || entity.baseData.typeOfTransfer === 'zahr. transfer') {

						var tsRealization = dateUtils.strToTS(entity.baseData.dateOfRealization);
						if (tsRealization){
							eventScheduler.scheduleEvent(tsRealization,'event-transfer-realization-officer',{transferId:entity.id},[entity.id],function(err,data){
								if (err){
									log.err(err);
									return;
								}
								log.debug('new events for transfer scheduled');
							} );
						} else {
							self.ctx.eventRegistry.emitProcesingError('Neplatný dátum realizácie. Transfer nebol vykonaný.',event);
						}
					}
				}
			});

		};

		this.removePlayerFromRoster=function(playerId,seasonId){

			var rostersDao = new universalDaoModule.UniversalDao(
				this.ctx.mongoDriver,
				{collectionName: 'rosters'}
			);

			var qf=QueryFilter.create();
			qf.addCriterium("baseData.season.oid",QueryFilter.operation.EQUAL,seasonId);
			qf.addCriterium("listOfPlayers.players",QueryFilter.operation.ALL,[{"registry" : "people","oid" : playerId}]);

			rostersDao.find(qf,function(err,rosters){

				if (err) {
					log.error(err);
				}
				rosters.forEach(function(roster){
					var filteredPlayers=[];
					roster.listOfPlayers.players.forEach(function(playerLink){
						if (playerLink && playerLink.oid!==playerId){
							filteredPlayers.push(playerLink);
						}
					});
					roster.listOfPlayers.players=filteredPlayers;
					roster.baseData.lastModification=new Date().getTime();
					rostersDao.save(roster,function(err){
						if (err){
							log.error(err);
							return;
						}
						log.debug("player removed from roster",playerId,roster);
					});
				});
			});
		};

		this.handleHostingStart=function (event){
			var self=this;
			var transferDao = new universalDaoModule.UniversalDao(
				this.ctx.mongoDriver,
				{collectionName: 'transfersOfficer'}
			);

			var peopleDao = new universalDaoModule.UniversalDao(
				this.ctx.mongoDriver,
				{collectionName: 'people'}
			);

			transferDao.get(event.transferId,function (err,transfer){
				if (err){log.error(err);return;}
				
				transfer.baseData.stateOfTransfer='schválený';

				peopleDao.get(transfer.baseData.officer.oid,function(err,officer){
					if (err){log.error(err);return;}
					if (!officer.officer){
						self.ctx.eventRegistry.emitProcesingError('Osoba nie je funkcionárom. Transfer nebol vykonaný.',event);
						return;
					}
					if (!officer.officer.club || !officer.officer.club.oid ){
						self.ctx.eventRegistry.emitProcesingError('Funkcionár nemá definovaný klub. Transfer nebol vykonaný.',event);
						return;
					}
					if ( officer.officer.club.oid!=transfer.baseData.clubFrom.oid){
						self.ctx.eventRegistry.emitProcesingError('Klub FROM sa nezhoduje s aktuálnym klubom. Transfer nebol vykonaný.',event);
						return;
					}
					officer.officer.club=transfer.baseData.clubTo;
					officer.officer.dateOfApplicationForId=transfer.baseData.dateFrom;
					officer.officer.dateOfExpiration=transfer.baseData.dateTo;
					transfer.baseData.active='TRUE';

					var playerId=officer.id;

					peopleDao.save(officer, function(err,data){
						if (err){log.error(err);return;}

						transferDao.save(transfer,function(err,data){
							if (err){log.error(err);return;}
							log.verbose('transfer updated');
							self.removePlayerFromRoster(playerId,transfer.baseData.season.oid);
						});
					});
				});
			});
		};

		this.handleHostingEnd=function (event){
			var self=this;
			var transferDao = new universalDaoModule.UniversalDao(
				this.ctx.mongoDriver,
				{collectionName: 'transfersOfficer'}
			);

			var peopleDao = new universalDaoModule.UniversalDao(
				this.ctx.mongoDriver,
				{collectionName: 'people'}
			);

			transferDao.get(event.transferId,function (err,transfer){
				if (err){log.error(err);return;}
					console.log(transfer);

				transfer.baseData.active='FALSE';

				peopleDao.get(transfer.baseData.officer.oid,function(err,officer){
					if (err){log.error(err);return;}

					if (!officer.officer){
							self.ctx.eventRegistry.emitProcesingError('Osoba nie je funkcionár. Transfer nebol vykonaný.',event);
							return;
					}
					if (!officer.officer.club || !officer.officer.club.oid ){
							self.ctx.eventRegistry.emitProcesingError('Funkcionár nemá definovaný klub. Transfer nebol vykonaný.',event);
							return;
					}

					if (officer.officer.club.oid!=transfer.baseData.clubTo.oid){
						self.ctx.eventRegistry.emitProcesingError('Klub TO sa nezhoduje s aktuálnym klubom. Transfer nebol vykonaný.',event);
						return;
					}
					officer.officer.club=transfer.baseData.clubFrom;
					officer.officer.dateOfApplicationForId=null;
					officer.officer.dateOfExpiration=null;
					var playerId=officer.id;
					peopleDao.save(officer, function(err,data){
						if (err){log.error(err);return;}

						transferDao.save(transfer,function(err,data){
							if (err){log.error(err);return;}
							log.verbose('transfer updated');
							self.removePlayerFromRoster(playerId,transfer.baseData.season.oid);
						});
					});
				});
			});
		};

		this.handleTransferRealization=function (event){

			var transferDao = new universalDaoModule.UniversalDao(
				this.ctx.mongoDriver,
				{collectionName: 'transfersOfficer'}
			);

			var peopleDao = new universalDaoModule.UniversalDao(
				this.ctx.mongoDriver,
				{collectionName: 'people'}
			);

			transferDao.get(event.transferId,function (err,transfer){
				if (err){log.error(err);return;}
					console.log(transfer);

				transfer.baseData.active='FALSE';

				peopleDao.get(transfer.baseData.officer.oid,function(err,officer){
					if (err){log.error(err);return;}

					if (!officer.officer){
						self.ctx.eventRegistry.emitProcesingError('Osoba nie je funkcionár. Transfer nebol vykonaný.',event);
						return;
					}
					if (!officer.officer.club || !officer.officer.club.oid ){
						self.ctx.eventRegistry.emitProcesingError('Funkcionár nemá definovaný klub. Transfer nebol vykonaný.',event);
						return;
					}
					if (officer.officer.club.oid!=transfer.baseData.clubFrom.oid){
						self.ctx.eventRegistry.emitProcesingError('Klub FROM sa nezhoduje s aktuálnym klubom. Transfer nebol vykonaný.',event);
						return;
					}
					officer.officer.club=transfer.baseData.clubTo;
					officer.officer.dateOfApplicationForId=null;
					officer.officer.dateOfExpiration=null;
					var playerId=officer.id;
					peopleDao.save(officer, function(err,data){
						if (err){log.error(err);return;}

						transferDao.save(transfer,function(err,data){
							if (err){log.error(err);return;}
							self.removePlayerFromRoster(playerId,transfer.baseData.season.oid);
						});
					});
				});
			});

		};

	}

	TransferHandler.prototype.handle = function(event) {
		log.info('handle called',event,TransferHandler.prototype.ctx);

		if ("event-transfer-officer-created" === event.eventType){
			this.handleTransferChange(event);
		} else

		if ("event-transfer-officer-updated" === event.eventType){
			this.handleTransferChange(event);
		}else
		if ("event-hosting-start-officer" === event.eventType){
			this.handleHostingStart(event);
		}else
		if ("event-hosting-end-officer" === event.eventType){
			this.handleHostingEnd(event);
		}else

		if ("event-transfer-realization-officer" === event.eventType){
			this.handleTransferRealization(event);
		}

	};

	TransferHandler.prototype.getType=function(){
		return ['event-transfer-officer-updated','event-transfer-officer-created','event-hosting-start-officer','event-hosting-end-officer','event-transfer-realization-officer'];
	};


	module.exports = function( ctx) {
		return new TransferHandler(ctx );
	};
}());
