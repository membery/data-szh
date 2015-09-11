(function(angular) {
	'use strict';

	angular.module('match-events', [])
	.config(function($locationProvider) {
		$locationProvider.html5Mode({
			enabled: true,
			requireBase: false
		});
	})
	.controller('editor', ['$http', '$scope', '$location', '$interval', function($http, $scope, $location, $interval) {

		function safeExtract(obj, path, defaultVal) {
			function i(iObj, pathArr) {
				// function dives one level into obj and removes first element in array
				if(iObj && pathArr.length > 0) {
					var f = pathArr.shift();
					if (iObj.hasOwnProperty(f)) {
						return i(iObj[f], pathArr);
					} else {
						return undefined;
					}
				} else {
					return iObj;
				}
			}

			if (obj && path) {
				var v = i(obj, path.split('.'));
				if (v) {
					return v;
				} else {
					return defaultVal;
				}
			} else {
				return defaultVal;
			}
		}

		$scope.dataVer = 0;
		$scope.lastSent = 0;

		$scope.id = $location.search().id;
		$scope.obj = {};
		$scope.initPhase = 0;

		$scope.data = {};

		$scope.timer = 0;
		$scope.time = {
			mins: '00',
			secs: '00',
			running: false
		};

		$scope.nEvt = {
			time: '',
			home: '',
			away: '',
			action: ''
		};

		$scope.timerToTime = function() {
			$scope.time.mins = Math.floor($scope.timer / 60);
			$scope.time.secs = $scope.timer % 60;

			if ($scope.time.secs.toString().length === 1) {
				$scope.time.secs = '0'.concat($scope.time.secs);
			}

			if ($scope.time.mins.toString().length === 1) {
				$scope.time.mins = '0'.concat($scope.time.mins);
			}
		};

		$scope.timeToTimer = function() {
			$scope.timer = (parseInt($scope.time.mins) * 60) + parseInt($scope.time.secs);

			if (isNaN($scope.timer)) {
				$scope.timer = 0;
			}
		};

		$scope.timeToTimerV = function(vstr) {
			var sstr = vstr.split(':');

			if (sstr.length !== 2) {
				return 0;
			}

			var r = (parseInt(sstr[0]) * 60) + parseInt(sstr[1]);

			if (isNaN(r)) {
				return 0;
			}

			return r;
		};

		$scope.startTimer = function() {
			$scope.time.running = true;
		};

		$scope.pauseTimer = function() {
			$scope.time.running = false;
		};

		$scope.adjustTimer = function(v) {
			$scope.timer += v;

			if ($scope.timer < 0) {
				$scope.timer = 0;
			}
			$scope.timerToTime();
		};

		$scope.setTimer = function(v) {
			$scope.timer = v;
			$scope.timerToTime();
		};

		$interval(function() {
			if ($scope.time.running) {
				++$scope.timer;
				$scope.timerToTime();
			}
		}, 1000);

		$interval(function() {
			if ($scope.dataVer > $scope.lastSent) {
				// data to sent
				var ver = $scope.dataVer;

				var d = {
					id: $scope.id,
					baseData: {
						halfTimeScoreHome: $scope.data.scoreHomeHalf,
						halfTimeScoreAway: $scope.data.scoreAwayHalf,
						scoreHome: $scope.data.scopeHome,
						scoreAway: $scope.data.scopeAway,
						fullTimeScoreHome: $scope.data.scopeHome,
						fullTimeScoreAway: $scope.data.scopeAway
					},
					additionalInfo: {
						countOfPenaltyShootHome: $scope.data.m7Home,
						countOfPenaltyShootAway: $scope.data.m7Away,
						goalOfPenaltyShootHome: $scope.data.m7HomeGoals,
						goalOfPenaltyShootAway: $scope.data.m7AwayGoals
					},
					technicalData: {
						events: []
					}
				};

				for (var e = $scope.data.events.length - 1; e >= 0; --e ) {
					var evt = $scope.data.events[e];

					d.technicalData.events.push(angular.copy(evt));
				}

				$http({method: 'PUT', url: '/udao/saveBySchema/uri~3A~2F~2Fregistries~2FrefereeReports~23views~2FrefereeReports-km~2Fview/', data: d})
				.success(function() {
					$scope.lastSent = ver;
					$scope.error = false;
				}).error(function() {
					$scope.error = true;
				});
			}
		}, 5000);

		$scope.objToData = function() {
			var k;
			$scope.data.homeClub = safeExtract($scope.obj, 'baseData.homeClub.refData.name', 'Unknown');
			$scope.data.guestClub = safeExtract($scope.obj, 'baseData.awayClub.refData.name', 'Unknown');
			$scope.data.competition = safeExtract($scope.obj, 'baseData.competition.refData.name', 'Unknown');
			$scope.data.competitionPart = safeExtract($scope.obj, 'baseData.competitionPart.refData.name', 'Unknown');
			$scope.data.code = safeExtract($scope.obj, 'baseData.matchNumber', 'Unknown');
			var d = safeExtract($scope.obj, 'baseData.matchDate', 'Unknown');
			if (d && d.length === 8) {
				$scope.data.date = d.substring(6, 8).concat('.', d.substring(4, 6), '.', d.substring(0, 4));
			}
			$scope.data.time = safeExtract($scope.obj, 'baseData.matchBegin', 'Unknown');

			$scope.data.scopeHome = 0;
			$scope.data.scopeAway = 0;
			$scope.data.scoreHomeHalf = 0;
			$scope.data.scoreAwayHalf = 0;
			$scope.data.m7Home = 0;
			$scope.data.m7Away = 0;
			$scope.data.m7HomeGoals = 0;
			$scope.data.m7AwayGoals = 0;
			$scope.data.playersHome = [];
			$scope.data.playersGuest = [];

			$scope.data.officersHome = [];
			$scope.data.officersGuest = [];

			['A', 'B', 'C', 'D'].forEach(function(v) {
				if(safeExtract($scope.obj.officersGuest, 'officer' + v, '') !== '') {
					$scope.data.officersGuest.push({
						jersey: v,
						name: safeExtract($scope.obj.officersGuest, 'officer' + v + '.refData.surName', '')
										+ ' ' + safeExtract($scope.obj.officersGuest, 'officer' + v + '.refData.firstName', '')
					});
				}
				if(safeExtract($scope.obj.officersHome, 'officer' + v, '') !== '') {
					$scope.data.officersHome.push({
						jersey: v,
						name: safeExtract($scope.obj.officersHome, 'officer' + v + '.refData.surName', '')
										+ ' ' + safeExtract($scope.obj.officersHome, 'officer' + v + '.refData.firstName', '')
					});
				}
			});

			if ($scope.obj && $scope.obj.listOfPlayersHome && $scope.obj.listOfPlayersHome.players) {
				for (k in $scope.obj.listOfPlayersHome.players) {
					var cur = {
						jersey: $scope.obj.listOfPlayersHome.players[k].dressNumber || 'X',
						name: safeExtract($scope.obj.listOfPlayersHome.players[k], 'player.refData.surName', '')
								+ ' ' + safeExtract($scope.obj.listOfPlayersHome.players[k], 'player.refData.firstName', ''),
						rp: safeExtract($scope.obj.listOfPlayersHome.players[k], 'player.refData.registrationID', ''),
						events: ''
					};

					// set alt. name
					if (cur.name === ' ') {
						cur.name = safeExtract($scope.obj.listOfPlayersHome.players[k], 'altName', '');
					}

					$scope.data.playersHome.push(cur);

				}
			}

			$scope.data.playersHome.sort(function(a, b) {return parseInt(a.jersey) - parseInt(b.jersey); });

			$scope.data.playersHomeLimit = Math.max($scope.data.playersHome.length - 8, 0);

			if ($scope.obj && $scope.obj.listOfPlayersGuest && $scope.obj.listOfPlayersGuest.players) {
				for (k in $scope.obj.listOfPlayersGuest.players) {
					var cur = {
						jersey: $scope.obj.listOfPlayersGuest.players[k].dressNumber || 'X',
						name: safeExtract($scope.obj.listOfPlayersGuest.players[k], 'player.refData.surName', '')
								+ ' ' + safeExtract($scope.obj.listOfPlayersGuest.players[k], 'player.refData.firstName', ''),
						rp: safeExtract($scope.obj.listOfPlayersGuest.players[k], 'player.refData.registrationID', ''),
						events: ''
					};

					// set alt. name
					if (cur.name === ' ') {
						cur.name = safeExtract($scope.obj.listOfPlayersGuest.players[k], 'altName', '');
					}

					$scope.data.playersGuest.push(cur);
				}
			}

			$scope.data.playersGuest.sort(function(a, b) {return parseInt(a.jersey) - parseInt(b.jersey); });

			$scope.data.playersGuestLimit = Math.max($scope.data.playersGuest.length - 8, 0);

			$scope.data.events = [];

			if ($scope.obj.technicalData && $scope.obj.technicalData.events) {
				for (k in $scope.obj.technicalData.events) {
					$scope.data.events.push(angular.copy($scope.obj.technicalData.events[k]));
				}
			}

			$scope.data.events.sort(function(a, b) {return $scope.timeToTimerV(b.time || '') - $scope.timeToTimerV(a.time || ''); });

			$scope.lastSent = 1;
			$scope.eventsChanged();
		};

		$scope.applyE = function() {

			if ($scope.nEvt.time === '') {
				$scope.nEvt.time = $scope.time.mins + ':' + $scope.time.secs;
			}

			$scope.data.events.unshift(angular.copy($scope.nEvt));

			$scope.nEvt.time = '';
			$scope.nEvt.home = '';
			$scope.nEvt.away = '';
			$scope.nEvt.action = '';


			document.getElementById('secondInput').focus();

			$scope.eventsChanged();
		};

		$scope.setPlayerH = function(i) {
			$scope.nEvt.home = $scope.data.playersHome[i].jersey;
			$scope.nEvt.away = '';
		};
		$scope.setPlayerA = function(i) {
			$scope.nEvt.away = $scope.data.playersGuest[i].jersey;
			$scope.nEvt.home = '';
		};
		$scope.setOfficerH = function(i) {
			$scope.nEvt.away = '';
			$scope.nEvt.home = i;
		};
		$scope.setOfficerA = function(i) {
			$scope.nEvt.away = i;
			$scope.nEvt.home = '';
		};

		$scope.setE = function(e) {
			$scope.nEvt.action = e;
			$scope.applyE();
		};

		$scope.removeE = function(e) {
			$scope.data.events.splice(e, 1);

			$scope.eventsChanged();
		};

		function findPlayerIdxByJersey(arr, jersey) {
			for (var p in arr) {
				if (arr[p].jersey === jersey) {
					return p;
				}
			}

			return null;
		}

		function findOfficerByLetter(arr, letter) {
			for (var p in arr) {
				if (arr[p].jersey === letter) {
					return p;
				}
			}

			return null;
		}

		$scope.eventsChanged = function() {
			var p;
			$scope.data.events.sort(function(a, b) {return $scope.timeToTimerV(b.time || '') - $scope.timeToTimerV(a.time || ''); });

			for (p in $scope.data.playersHome) {
				$scope.data.playersHome[p].events = '';
				$scope.data.playersHome[p].points = '';
				$scope.data.playersHome[p].punishments = '';
			}
			for (p in $scope.data.playersGuest) {
				$scope.data.playersGuest[p].events = '';
				$scope.data.playersGuest[p].points = '';
				$scope.data.playersGuest[p].punishments = '';
			}

			for (p in $scope.data.officersHome) {
				$scope.data.officersHome[p].punishments = '';
			}
			for (p in $scope.data.officersGuest) {
				$scope.data.officersGuest[p].punishments = '';
			}

			$scope.data.scoreHomeHalf = 0;
			$scope.data.scoreAwayHalf = 0;
			$scope.data.scopeHome = 0;
			$scope.data.scopeAway = 0;
			$scope.data.m7Home = 0;
			$scope.data.m7Away = 0;
			$scope.data.m7HomeGoals = 0;
			$scope.data.m7AwayGoals = 0;

			for (var e = $scope.data.events.length - 1; e >= 0; --e ) {
				var evt = $scope.data.events[e];

				var evtTimer = $scope.timeToTimerV(evt.time);

				var i;
				var player = null;
				var officer = null;

				if (evt.home && evt.home !== '') {
					i = findPlayerIdxByJersey($scope.data.playersHome, evt.home);
					if (i === null) {
						i = findOfficerByLetter($scope.data.officersHome, evt.home);
						if (i !== null && 'N2D'.indexOf(evt.action) > -1) {
							officer = $scope.data.officersHome[i];
							officer.punishments = officer.punishments.concat(evt.action);
						}
						continue;
					}
					player = $scope.data.playersHome[i];
					if (evt.action === 'G') {
						player.events = player.events.concat(++$scope.data.scopeHome + ';');
						if (evtTimer < 30 * 60 ) {
							++$scope.data.scoreHomeHalf;
						}
						if (player.points === '') {
							player.points = 0;
						}
						++player.points;
					} else if (evt.action === '7') {
						player.events = player.events.concat('[' + (++$scope.data.scopeHome) + '];');
						if (evtTimer < 30 * 60 ) {
							++$scope.data.scoreHomeHalf;
						}
						if (player.points === '') {
							player.points = 0;
						}
						++$scope.data.m7Home;
						++$scope.data.m7HomeGoals;
						++player.points;
					} else if (evt.action === '0') {
						player.events = player.events.concat('\u277C;');
						++$scope.data.m7Home;
					} else if (evt.action === 'N') {
						player.punishments = player.punishments.concat('N');
					} else if (evt.action === '2') {
						player.punishments = player.punishments.concat('2');
					} else if (evt.action === 'D') {
						player.punishments = player.punishments.concat('D');
					}
				} else if (evt.away && evt.away !== '') {
					i = findPlayerIdxByJersey($scope.data.playersGuest, evt.away);
					if (i === null) {
						i = findOfficerByLetter($scope.data.officersGuest, evt.away);
						if (i !== null && 'N2D'.indexOf(evt.action) > -1) {
							officer = $scope.data.officersGuest[i];
							officer.punishments = officer.punishments.concat(evt.action);
						}
						continue;
					}
					player = $scope.data.playersGuest[i];
					if (evt.action === 'G') {
						player.events = player.events.concat(++$scope.data.scopeAway + ';');
						if (evtTimer < 30 * 60 ) {
							++$scope.data.scoreAwayHalf;
						}
						if (player.points === '') {
							player.points = 0;
						}
						++player.points;
					} else if (evt.action === '7') {
						player.events = player.events.concat('[' + (++$scope.data.scopeAway) + '];');
						if (evtTimer < 30 * 60 ) {
							++$scope.data.scoreAwayHalf;
						}
						if (player.points === '') {
							player.points = 0;
						}
						++$scope.data.m7Away;
						++$scope.data.m7AwayGoals;
						++player.points;
					} else if (evt.action === '0') {
						player.events = player.events.concat('\u277C;');
						++$scope.data.m7Away;
					} else if (evt.action === 'N') {
						player.punishments = player.punishments.concat('N');
					} else if (evt.action === '2') {
						player.punishments = player.punishments.concat('2');
					} else if (evt.action === 'D') {
						player.punishments = player.punishments.concat('D');
					}
				}
			}


			++$scope.dataVer;
		};

		$scope.loadMatchData = function() {
			$http({method: 'GET', url: '/udao/getBySchema/uri~3A~2F~2Fregistries~2FrefereeReports~23views~2FrefereeReports-km~2Fview/' + $scope.id})
			.success(function(data) {
				$scope.obj = data;

				$scope.objToData();
				$scope.initPhase = 1;
			}).error(function() {
				$scope.initPhase = -1;
			});
		};

		$scope.loadMatchData();
	}]);
}(window.angular));
