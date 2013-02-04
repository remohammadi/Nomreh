if ("undefined" == typeof(NomrehChrome)) {
	var NomrehChrome = {};
};

const Ci = Components.interfaces;
const Cc = Components.classes;
const VALID_DECIMAL_KEYS = {0:1, 13:1, 27:1, 9:1, 8:1, 16:1, 48:1, 49:1, 50:1, 51:1, 52:1, 53:1, 54:1, 55:1, 56:1, 57:1, 46:1};
const DEFAULT_INVALID_KEYS = {60: 1, 62:1}

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");

NomrehChrome = {
	currentPage: 'contests',
	logger: 0,
	contestsDbConnection: 0,
	currentContestDb: 0,
	currentContest: {},
	stringBundle: 0,
	contestTBody: 0,
	breadcrumbRoot: 0,
	inputScoresBtn: 0,
	rankingsBtn: 0,
	loading: 0,
	currentPlayerId: 0,
	playersUl: 0,
	scoringPanelDiv: 0,
	toBeStored: 0,
	init: function(window) {
		this.logger = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
		this.prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);

		this.contestTBody = document.getElementById("contest-tbody");
		this.breadcrumbRoot = document.getElementById("breadcrumb");
		this.loading = document.getElementById("loading");
		this.inputScoresBtn = document.getElementById("input-scores-btn");
		this.rankingsBtn = document.getElementById("rankings-btn");
		this.playersUl = document.getElementById("players-ul");
		this.scoringPanelDiv = document.getElementById("scoring-panel-div");

		let file = this.getLocalDirectory();
		file.append("nomreh.sqlite");
		let alreadyExists = file.exists();
		this.contestsDbConnection = Services.storage.openDatabase(file); // create the file if not exist

		if (!alreadyExists) {
			this.logger.logStringMessage("Nomreh :: Creting contests table.");
			this.contestsDbConnection.createTable("contests", "id INTEGER PRIMARY KEY, title TEXT, date TEXT DEFAULT CURRENT_TIMESTAMP");
		}

		window.addEventListener("beforeunload", function( event ) {
			NomrehChrome.storeTheStuff();
		}, false);

		this.loadContests();
	},
	showLoading: function() {
		let l = $(this.loading);
		l.show();
	},
	hideLoading: function() {
		let l = $(this.loading);
		l.hide();
	},
	setBreadcrumb: function(pages) {
		let contestsS = this.getMessage("nomreh.contests");
		if (pages.length == 0) {
			this.breadcrumbRoot.innerHTML = '<li class="active">' + contestsS + '</li>';
		} else {
			let html = '<li><a href="#" onclick="NomrehChrome.goto(\'contests\');">' + contestsS + '</a> <span class="divider">&gt;</span></li>';
			for (var i = 0; i < pages.length; i++) {
				if (i < pages.length - 1) {
					var subpage = "";
					if (pages[i][2]) {
						subpage = ", " + pages[i][2];
					}
					html += '<li><a id="breadcrumb-' + pages[i][0] + '" href="#" onclick="NomrehChrome.goto(\'' +
						pages[i][0] + "'" + subpage + ');">' + pages[i][1] + '</a> <span class="divider">&gt;</span></li>';
				} else {
					html += '<li id="breadcrumb-' + pages[i][0] + '" class="active">' + pages[i][1] + '</li>'
				}
			}
			this.breadcrumbRoot.innerHTML = html;
		}
	},
	storeTheStuff: function() {
		if (this.toBeStored) {
			this.toBeStored.call(this);
			this.toBeStored = 0;
		}
	},
	goto: function(page, subpage) {
		this.storeTheStuff();

		if (page == this.currentPage) return;

		this.currentPage = page;
		$('.npage').hide();
		if (page == 'contest') {
			this.showLoading();
			this.currentContest = {}

			if (! subpage) {
				let title = this.getMessage("nomreh.new_contest");
				this.contestsDbConnection.executeSimpleSQL('INSERT INTO contests (title) VALUES("' + title + '")');
				let statement = this.contestsDbConnection.createStatement("SELECT last_insert_rowid() as new_id FROM contests");
				statement.executeStep();
				this.currentContest._id = statement.row.new_id;
			} else {
				this.currentContest._id = subpage;
			}

			let statement = this.contestsDbConnection.createStatement("SELECT title, date FROM contests WHERE id=" + this.currentContest._id);
			statement.executeStep();
			this.currentContest.title = statement.row.title;
			this.currentContest.date = statement.row.date;

			$("#contest_name").html(this.currentContest.title);

			if (this.currentContestDb != 0) {
				this.currentContestDb.asyncClose();
			}
			let file = this.getLocalDirectory();
			file.append("contest_" + this.currentContest._id + ".sqlite");
			let alreadyExists = file.exists();
			this.currentContestDb = Services.storage.openDatabase(file); // create the file if not exist

			if (!alreadyExists) {
				this.logger.logStringMessage("Nomreh :: Creting contest [" + this.currentContest._id + "] table.");
				this.currentContestDb.createTable("judges", "id INTEGER PRIMARY KEY, title TEXT");
				this.currentContestDb.createTable("tests", "id INTEGER PRIMARY KEY, title TEXT, factor REAL");
				this.currentContestDb.createTable("players", "id INTEGER PRIMARY KEY, fname TEXT, lname TEXT, org TEXT, notes TEXT");
				this.currentContestDb.createTable("scores", "player_id INTEGER, judge_id INTEGER, test_id INTEGER, val REAL, UNIQUE(player_id, judge_id, test_id) ON CONFLICT REPLACE");
				this.currentContestDb.createTable("fscores", "player_id INTEGER, test_id INTEGER, penalty REAL, final REAL DEFAULT 0, UNIQUE(player_id, test_id) ON CONFLICT REPLACE");

				this.currentContest.judges = {'num': 0};
				this.currentContest.tests = {'num': 0};
				this.currentContest.players = [];

				NomrehChrome.inputScoresBtn.setAttribute("disabled","disabled");
				NomrehChrome.rankingsBtn.setAttribute("disabled","disabled");
				this.loadContestDetails();
			} else {
				this.loadContestDb({'judges': true, 'tests': true, 'players': true, 'callback': this.loadContestDetails});
			}
		} else if (page == 'contests') {
			this.loadContests();
			this.setBreadcrumb([]);
			$('#contests').show();
		} else if (page == 'scoring') {
			this.setBreadcrumb([
				['contest', this.currentContest.title, this.currentContest._id],
				['scoring', this.getMessage("nomreh.scoring_panel")]
			]);
			this.currentPlayerId = 0;
			$(this.scoringPanelDiv).hide();
			this.loadContestDb({'players': true, 'callback': this.loadPlayersList});
		} else if (page == 'rankings') {
			this.setBreadcrumb([
				['contest', this.currentContest.title, this.currentContest._id],
				['rankings', this.getMessage("nomreh.rankings")]
			]);
			$('#rankings').show();
		}
	},
	loadContestDbLock: 0,
	loadContestDb: function(flags) {
		if (NomrehChrome.loadContestDbLock > 0) {
			this.logger.logStringMessage("Nomreh :: loadContestDbLock= " + NomrehChrome.loadContestDbLock);
			return;
		}
		if ('judges' in flags) {
			NomrehChrome.loadContestDbLock += 1;
			NomrehChrome.currentContest.judges = {'num': 0};
		}
		if ('tests' in flags) {
			NomrehChrome.loadContestDbLock += 1;
			NomrehChrome.currentContest.tests = {'num': 0};
		}
		if ('players' in flags) {
			NomrehChrome.loadContestDbLock += 1;
			NomrehChrome.currentContest.players = [];
		}
		if ('scores_penalties' in flags) {
			NomrehChrome.loadContestDbLock += 2;
			NomrehChrome.currentContest.scores = {};
			NomrehChrome.currentContest.penalties = {};
		}

		var _handleCompletion = function(aReason) {
			if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED) {
				NomrehChrome.logger.logStringMessage("Nomreh :: Query canceled or aborted!");
			}

			NomrehChrome.loadContestDbLock -= 1;
			if (NomrehChrome.loadContestDbLock == 0) {
				if ('callback' in flags) {
					flags['callback'].call(NomrehChrome);
				}

				if ('focus' in flags) {
					document.getElementById(flags['focus']).focus();
				}

				var inputScoresBtnEnabled = NomrehChrome.currentContest.judges.num > 0;
				inputScoresBtnEnabled &= NomrehChrome.currentContest.tests.num > 0;
				if (inputScoresBtnEnabled) {
					NomrehChrome.inputScoresBtn.removeAttribute("disabled");
				} else {
					NomrehChrome.inputScoresBtn.setAttribute("disabled","disabled");
				}

				var rankingsBtnEnabled = inputScoresBtnEnabled;
				rankingsBtnEnabled &= NomrehChrome.currentContest.players.length > 0;
				if (rankingsBtnEnabled) {
					NomrehChrome.rankingsBtn.removeAttribute("disabled");
				} else {
					NomrehChrome.rankingsBtn.setAttribute("disabled","disabled");
				}
			}
		};
		var _handleError = function(aError) {
			NomrehChrome.logger.logStringMessage("Nomreh :: Error: " + aError.message);
		};

		if ('judges' in flags) {
			let statement = this.currentContestDb.createStatement("SELECT id, title FROM judges ORDER BY id");
			statement.executeAsync({
				handleResult: function(aResultSet) {
					for (let row = aResultSet.getNextRow(); row;
							row = aResultSet.getNextRow()) {
						NomrehChrome.currentContest.judges[row.getResultByName("id")] = row.getResultByName("title");
						NomrehChrome.currentContest.judges.num += 1;
					}
				},
				handleError: _handleError,
				handleCompletion: _handleCompletion
			});
		}

		if ('tests' in flags) {
			let statement = this.currentContestDb.createStatement("SELECT id, title, factor FROM tests ORDER BY id");
			statement.executeAsync({
				handleResult: function(aResultSet) {
					for (let row = aResultSet.getNextRow(); row;
							row = aResultSet.getNextRow()) {
						NomrehChrome.currentContest.tests[row.getResultByName("id")] = {
							'title': row.getResultByName("title"),
							'factor': row.getResultByName("factor")
						};
						NomrehChrome.currentContest.tests.num += 1;
					}
				},
				handleError: _handleError,
				handleCompletion: _handleCompletion
			});
		}

		if ('players' in flags) {
			let statement = this.currentContestDb.createStatement("SELECT id, fname, lname FROM players ORDER BY id");
			statement.executeAsync({
				handleResult: function(aResultSet) {
					for (let row = aResultSet.getNextRow(); row;
							row = aResultSet.getNextRow()) {
						NomrehChrome.currentContest.players.push({
							'id': row.getResultByName("id"),
							'fname': row.getResultByName("fname"),
							'lname': row.getResultByName("lname")
						});
					}
				},
				handleError: _handleError,
				handleCompletion: _handleCompletion
			});
		}

		if ('scores_penalties' in flags) {
			let statement = this.currentContestDb.createStatement("SELECT judge_id, test_id, val FROM scores WHERE player_id=" + this.currentPlayerId);
			statement.executeAsync({
				handleResult: function(aResultSet) {
					for (let row = aResultSet.getNextRow(); row;
							row = aResultSet.getNextRow()) {
						NomrehChrome.currentContest.scores[row.getResultByName("judge_id") + '-' +
							row.getResultByName("test_id")] = row.getResultByName("val");
					}
				},
				handleError: _handleError,
				handleCompletion: _handleCompletion
			});

			let statement2 = this.currentContestDb.createStatement("SELECT test_id, penalty FROM fscores WHERE player_id=" + this.currentPlayerId);
			statement2.executeAsync({
				handleResult: function(aResultSet) {
					for (let row = aResultSet.getNextRow(); row;
							row = aResultSet.getNextRow()) {
						NomrehChrome.currentContest.penalties[row.getResultByName("test_id")] = row.getResultByName("penalty");
					}
				},
				handleError: _handleError,
				handleCompletion: _handleCompletion
			});
		}
	},
	loadContestDetails: function() {
		let html = "";
		for (_id in this.currentContest.judges) {
			if (_id == 'num') continue;
			let j_title = this.currentContest.judges[_id];
			html += "<tr><td class='nomreh-editable' data-dbid='" + _id + "' onclick=\"NomrehChrome.edit(this, 'judgeTitleModified');\">" + j_title + "</td>";
			html +=	"<td><a class='btn btn-small btn-danger' onclick='NomrehChrome.removeJudge(";
			html += _id + ")'><i class='icon-white icon-remove'></i></a></td></tr>";
		}
		let ph = this.getMessage("nomreh.new_judge_ph");
		html += "<tr><td colspan='2'><input id='new-judge-title' class='input-block-level' type='text' placeholder='" + ph;
		html += "' onkeyup='NomrehChrome.newJudge(event, this)' /></td></tr>";
		document.getElementById("judges-tbody").innerHTML = html;

		let html = "";
		for (_id in this.currentContest.tests) {
			if (_id == 'num') continue;
			let t_title = this.currentContest.tests[_id].title;
			let t_factor = this.currentContest.tests[_id].factor;
			html += "<tr><td class='nomreh-editable' data-dbid='" + _id + "' onclick=\"NomrehChrome.edit(this, 'testTitleModified');\">" + t_title + "</td>";
			html += "<td class='nomreh-editable' data-dbid='" + _id + "' onclick=\"NomrehChrome.edit(this, 'testFactorModified', 'numericInput');\">" + t_factor + "</td>";
			html +=	"<td><a class='btn btn-small btn-danger' onclick='NomrehChrome.removeTest(";
			html += _id + ")'><i class='icon-white icon-remove'></i></a></td></tr>";
		}
		let ph = this.getMessage("nomreh.new_test_ph");
		html += "<tr><td colspan='3' class='form-inline'>";
		html += "<input id='new-test-title' type='text' placeholder='" + ph + "' onkeyup='NomrehChrome.newTest(event, this)' /> ";
		html += "<input id='new-test-factor' type='number' value='1.0' onkeyup='return NomrehChrome.newTest(event, this);'"
		html += " onkeypress='return NomrehChrome.numericInput(event, this);' class='input-small' />";
		html += "</td></tr>";
		document.getElementById("tests-tbody").innerHTML = html;

		this.setBreadcrumb([['contest', this.currentContest.title]]);
		this.hideLoading();
		$('#contest').show();
	},
	loadContests: function() {
		let statement = this.contestsDbConnection.createStatement("SELECT id, title, date FROM contests ORDER BY date DESC");
		statement.executeAsync({
			html: '',

			handleResult: function(aResultSet) {
				for (let row = aResultSet.getNextRow(); row;
						row = aResultSet.getNextRow()) {
					var _id = row.getResultByName("id");
					var title = row.getResultByName("title");
					this.html += "<tr><td><a href='#' onclick='NomrehChrome.goto(\"contest\", " + _id + ")'>";
					this.html += title + "</a></td>";
					this.html += "<td>" + row.getResultByName("date") + "</td>";
					this.html += "<td><a class='btn btn-small btn-danger' onclick='NomrehChrome.removeContest(";
					this.html += _id + ", \"" + title + "\")'><i class='icon-white icon-remove'></i></a></td></tr>\n";
				}
			},

			handleError: function(aError) {
				this.logger.logStringMessage("Nomreh :: Error: " + aError.message);
			},

			handleCompletion: function(aReason) {
				if (aReason != Components.interfaces.mozIStorageStatementCallback.REASON_FINISHED) {
					NomrehChrome.logger.logStringMessage("Nomreh :: Query canceled or aborted!");
				} else {
					NomrehChrome.contestTBody.innerHTML = this.html;
				}
			}
		});
	},
	loadPlayersList: function() {
		let html = "";
		for (p_order in this.currentContest.players) {
			var p = this.currentContest.players[p_order];
			var cls = '';
			if (this.currentPlayerId == p.id) {
				cls = 'class="active" ';
			}
			html += '<li ' + cls + 'id="player-li-' + p.id + '"><a data-dbid="' + p.id;
			html += '" href="#" onclick="NomrehChrome.selectPlayer(this)">' + p.fname + ' ' + p.lname + '</a></li>';
		}
		this.playersUl.innerHTML = html;
		$('#scoring').show();
	},
	getLocalDirectory: function() {
		let directoryService =
			Cc["@mozilla.org/file/directory_service;1"].
				getService(Ci.nsIProperties);
		// this is a reference to the profile dir (ProfD) now.
		let localDir = directoryService.get("ProfD", Ci.nsIFile);

		localDir.append("Nomreh");

		if (!localDir.exists() || !localDir.isDirectory()) {
			// read and write permissions to owner and group, read-only for others.
			localDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0774);
		}

		return localDir;
	},
	edit: function(element, on_change, on_keypress) {
		element = $(element);
		if (element.attr("editing") == 'true') return;
		element.attr("editing", 'true');
		let content = element.text();
		let val = content.trim();
		if (element.attr("last_editing")) {
			val = element.attr("last_editing").trim();
		}
		if (! on_keypress) {
			on_keypress = 'editDefaultKeyPress';
		}
		element.html('<input type="text" value="' + val + '" original="' + content +
			'" onkeyup="return NomrehChrome.editKeyUp(event, this, \'' + on_change + '\');"' +
			' onkeypress="return NomrehChrome.' + on_keypress + '(event, this);"' +
			' onblur="NomrehChrome.editBlur(event, this)" />');
		element.children()[0].focus();
		element.children()[0].select();
	},
	editKeyUp: function(event, element, on_change, on_keyup) {
		var keyCode = ('which' in event) ? event.which : event.keyCode;

		if (on_keyup) {
			let res = NomrehChrome[on_keyup].call(this, element, event, keyCode);
			if (! res) {
				return false;
			}
		}

		var enter = (keyCode == 13) || (keyCode == 9);
		if (enter || (keyCode == 27)) {
			el = $(element);
			let val = el.attr("original");
			let p = el.parent();
			if (enter) {
				val = element.value.trim();
			}
			p.html(val);
			p.removeAttr("last_editing")
			p.removeAttr("editing");
			if (enter && on_change) {
				NomrehChrome[on_change].call(this, p, val);
			}
		}
		return true;
	},
	editDefaultKeyPress: function(event, element) {
		if (event.metaKey) {
			return true;
		}
		var keyCode = ('which' in event) ? event.which : event.keyCode;

		if (keyCode in DEFAULT_INVALID_KEYS) {
			return false;
		}
		return true;
	},
	editBlur: function(event, element) {
		let el = $(element);
		let p = el.parent();
		p.attr("last_editing", element.value);
		p.html(el.attr("original"));
		p.attr("editing", 'false');
	},
	contestTitleModified: function(element, new_val) {
		var sql = 'UPDATE contests SET title="' + new_val + '" WHERE id=' + this.currentContest._id;
		this.contestsDbConnection.executeSimpleSQL(sql);
		let breadcrumb = document.getElementById("breadcrumb-contest");
		if (breadcrumb) {
			breadcrumb.innerHTML = new_val;
		}
	},
	newJudge: function(event, element) {
		var keyCode = ('which' in event) ? event.which : event.keyCode;
		if (keyCode == 13) {
			this.showLoading();
			var v = element.value.trim();
			if (v == "") {
				v = this.getMessage("nomreh.new_judge_default") + (this.currentContest.judges.num + 1);
			}
			this.currentContestDb.executeSimpleSQL('INSERT INTO judges (title) VALUES("' + v + '")');
			this.loadContestDb({'judges': true, 'focus': 'new-judge-title', 'callback': this.loadContestDetails});
		}
	},
	newTest: function(event, element) {
		var keyCode = ('which' in event) ? event.which : event.keyCode;

		if (keyCode == 13) {
			this.showLoading();
			var title = document.getElementById("new-test-title").value.trim();
			if (title == "") {
				title = this.getMessage("nomreh.new_test_default") + (this.currentContest.tests.num + 1);
			}
			var factor = document.getElementById("new-test-factor").value.trim();
			this.currentContestDb.executeSimpleSQL('INSERT INTO tests (title, factor) VALUES("' + title + '", ' + factor + ')');
			this.loadContestDb({'tests': true, 'focus': 'new-test-title', 'callback': this.loadContestDetails});
		}
	},
	judgeTitleModified: function(element, new_val) {
		let el = $(element);
		this.currentContestDb.executeSimpleSQL('UPDATE judges SET title="' + new_val + '" WHERE id=' + el.attr("data-dbid"));
	},
	testTitleModified: function(element, new_val) {
		let el = $(element);
		this.currentContestDb.executeSimpleSQL('UPDATE tests SET title="' + new_val + '" WHERE id=' + el.attr("data-dbid"));
	},
	testFactorModified: function(element, new_val) {
		let el = $(element);
		this.currentContestDb.executeSimpleSQL('UPDATE tests SET factor="' + new_val + '" WHERE id=' + el.attr("data-dbid"));
	},
	numericInput: function(event, element) {
		if (event.metaKey) {
			return true;
		}
		var keyCode = ('which' in event) ? event.which : event.keyCode;

		if (! (keyCode in VALID_DECIMAL_KEYS)) {
			return false;
		}

		if ((keyCode == 46) && (element.value.indexOf(".") !== -1)) {
			return false;
		}

		return true;
	},
	removeContest: function(_id, title) {
		if (this.prompts.confirm(window, this.getMessage("nomreh.delete_title", [title], 1),
							this.getMessage("nomreh.delete_sure"))) {

			this.currentContestDb = 0;
			this.currentContest = {};

			var sql = 'DELETE FROM contests WHERE id=' + _id;
			this.contestsDbConnection.executeSimpleSQL(sql);

			let file = this.getLocalDirectory();
			file.append("contest_" + _id + ".sqlite");
			file.remove(false);

			this.loadContests();
		}
	},
	removeJudge: function(_id) {
		var _del = function() {
			NomrehChrome.currentContestDb.executeSimpleSQL("DELETE FROM judges WHERE id=" + _id);
			NomrehChrome.loadContestDb({'judges': true, 'callback': NomrehChrome.loadContestDetails});
		};

		let statement = this.currentContestDb.createStatement("SELECT count(*) AS c FROM scores WHERE judge_id=" + _id);
		statement.executeStep();
		if (statement.row.c > 0) {
			let statement = this.currentContestDb.createStatement("SELECT title FROM judges WHERE id=" + _id);
			statement.executeStep();
			if (this.prompts.confirm(window, this.getMessage("nomreh.delete_title", [statement.row.title]),
								this.getMessage("nomreh.delete_judge_sure"))) {
				this.showLoading();
				this.currentContestDb.executeSimpleSQL("DELETE FROM scores WHERE judge_id=" + _id);
				_del();
			}
		} else {
			this.showLoading();
			_del();
		}
	},
	removeTest: function(_id) {
		var _del = function() {
			NomrehChrome.currentContestDb.executeSimpleSQL("DELETE FROM tests WHERE id=" + _id);
			NomrehChrome.loadContestDb({'tests': true, 'callback': NomrehChrome.loadContestDetails});
		};

		let statement = this.currentContestDb.createStatement("SELECT count(*) AS c FROM scores WHERE test_id=" + _id);
		statement.executeStep();
		if (statement.row.c == 0) {
			let statement = this.currentContestDb.createStatement("SELECT count(*) AS c FROM fscores WHERE test_id=" + _id);
			statement.executeStep();
		}
		if (statement.row.c > 0) {
			let statement = this.currentContestDb.createStatement("SELECT title FROM tests WHERE id=" + _id);
			statement.executeStep();
			if (this.prompts.confirm(window, this.getMessage("nomreh.delete_title", [statement.row.title]),
								this.getMessage("nomreh.delete_test_sure"))) {
				this.showLoading();
				this.currentContestDb.executeSimpleSQL("DELETE FROM scores WHERE test_id=" + _id);
				this.currentContestDb.executeSimpleSQL("DELETE FROM fscores WHERE test_id=" + _id);
				_del();
			}
		} else {
			this.showLoading();
			_del();
		}
	},
	newPlayer: function() {
		this.showLoading();
		var p = {
			'fname': this.getMessage("nomreh.new_player_df_fname"),
			'lname': this.getMessage("nomreh.new_player_df_lname"),
			'org': this.getMessage("nomreh.new_player_df_org"),
			'notes': ''
		};
		var sql = 'INSERT INTO players (fname, lname, org, notes) VALUES("';
		sql += p.fname + '", "' + p.lname + '", "' + p.org + '", "' + p.notes + '")';
		this.currentContestDb.executeSimpleSQL(sql);
		let statement = this.currentContestDb.createStatement("SELECT last_insert_rowid() as new_id FROM players");
		statement.executeStep();
		var _id = statement.row.new_id;
		var html = '<li id="player-li-' + _id + '"><a data-dbid="' + _id;
		html += '" href="#" onclick="NomrehChrome.selectPlayer(this)">' + p.fname + ' ' + p.lname + '</a></li>';
		this.playersUl.innerHTML += html;
		this.selectPlayer(document.getElementById("player-li-" + _id).firstChild);
	},
	selectPlayer: function(element) {
		this.showLoading();

		this.storeTheStuff();

		$("#players-ul .active").removeClass('active');
		var el = $(element);
		el.parent().addClass('active');
		this.currentPlayerId = el.attr("data-dbid");
		let statement = this.currentContestDb.createStatement("SELECT fname, lname, org, notes FROM players WHERE id=" + this.currentPlayerId);
		statement.executeStep();

		var el;
		el = document.getElementById("player-fname");
		el.innerHTML = statement.row.fname;
		$(el).removeAttr("last_editing");

		el = document.getElementById("player-lname");
		el.innerHTML = statement.row.lname;
		$(el).removeAttr("last_editing");

		el = document.getElementById("player-org");
		el.innerHTML = statement.row.org;
		$(el).removeAttr("last_editing");

		document.getElementById("player-notes").value = statement.row.notes;

		var thead = "<tr><th rowspan='2'>" + this.getMessage("nomreh.scroing_title_test") + "</th>";
		thead += "<th class='center' colspan='" + this.currentContest.judges.num + "'>" + this.getMessage("nomreh.scroing_title_scores_by_judges") + "</th>";
		thead += "<th rowspan='2'>" + this.getMessage("nomreh.scroing_title_average_by_judges") + "</th>";
		thead += "<th rowspan='2'>" + this.getMessage("nomreh.scroing_title_factor") + "</th>";
		thead += "<th rowspan='2'>" + this.getMessage("nomreh.scroing_title_penalty") + "</th>";
		thead += "<th rowspan='2'>" + this.getMessage("nomreh.scroing_title_final") + "</th></tr><tr>";
		for (j_id in this.currentContest.judges) {
			if (j_id == 'num') continue;
			thead += "<td>" + this.currentContest.judges[j_id] + "</td>";
		}
		thead += "</tr>";
		document.getElementById("scoring-thead").innerHTML = thead;

		this.loadContestDb({'scores_penalties': true, 'callback': this.selectPlayerOnLoad});
	},
	selectPlayerOnLoad: function() {
		var tbody = "";
		for (_id in this.currentContest.tests) {
			if (_id == 'num') continue;
			tbody += "<tr><td>" + this.currentContest.tests[_id].title + "</td>";
			for (j_id in this.currentContest.judges) {
				if (j_id != 'num') {
					var k = '' + j_id + '-' + _id;
					var v = '';
					if (this.currentContest.scores[k] || (this.currentContest.scores[k] == 0)) {
						v = this.currentContest.scores[k];
					}
					tbody += '<td><input class="score-i" id="si-' + k + '" data-tid="' + _id + '" data-jid="' + j_id;
					tbody += '" onkeypress="return NomrehChrome.numericInput(event, this);"';
					tbody += ' onchange="NomrehChrome.reCalAverage(' + _id + ')"';
					tbody += ' type="text" maxlength="3" value="' + v + '" style="width: 2em" /></td>';
				}
			}
			var k = '' + _id;
			var v = '';
			if (this.currentContest.penalties[k] || (this.currentContest.penalties[k] == 0)) {
				v = this.currentContest.penalties[k];
			}
			tbody += "<td class='center' id='score-average-" + _id + "'></td>";
			tbody += "<td class='center muted'>" + this.currentContest.tests[_id].factor + "</td>";
			tbody += '<td class="input-prepend"><span class="add-on">-</span>';
			tbody += '<input class="penalty-i" id="pi-' + k + '" data-tid="' + _id + '" type="text" maxlength="4"';
			tbody += ' onkeypress="return NomrehChrome.numericInput(event, this);"';
			tbody += ' onchange="NomrehChrome.reCalFinal(' + _id + ')"';
			tbody += ' value="' + v + '" style="width: 2em" /></td>';
			tbody += "<td class='center' id='score-final-" + _id + "'></td></tr>";
		}

		tbody += "<tr><td class='reverse' colspan='" + (this.currentContest.judges.num + 4);
		tbody += "' style='font-weight: bold'>" + this.getMessage("nomreh.scroing_title_total") + "</td>";
		tbody += "<td class='center' style='font-weight: bold' id='score-final'></td></tr>";

		document.getElementById("scoring-tbody").innerHTML = tbody;

		for (_id in this.currentContest.tests) {
			if (_id == 'num') continue;
			this.reCalAverage(_id);
			this.reCalFinal(_id);
		}

		this.toBeStored = this.savePlayerAndScores;

		$(this.scoringPanelDiv).show();
		this.hideLoading();
	},
	reCalAverage: function(_id) {
		var nums = [];
		var elements = [];
		for (j_id in this.currentContest.judges) {
			if (j_id != 'num') {
				var el = document.getElementById('si-' + j_id + '-' + _id);
				var v = el.value && parseFloat(el.value);
				if (el.value == '0') {
					v = 0.000001;
				}
				el = $(el);
				if (v) {
					elements.push(el);
					nums.push(v);
				}
				el.removeClass('ignored');
			}
		}
		if ((nums.length > 2 ) && (nums.length = this.currentContest.judges.num)) {
			var s = 0.0;
			var min = Math.min.apply(Math, nums) + 0.0000001;
			var max = Math.max.apply(Math, nums) - 0.0000001;
			var min_el = false;
			var max_el = false;

			for (i in nums) {
				if ((nums[i] < min) && (! min_el)) {
					min_el = elements[i];
				} else if ((nums[i] > max) && (! max_el)) {
					max_el = elements[i];
				} else {
					s += nums[i];
				}
			}

			if (min_el && max_el) {
				var avg = s / (nums.length - 2);
				avg = avg.toFixed(2);
				while ((avg.charAt(avg.length-1) == "0") || (avg.charAt(avg.length-1) == ".")) {
					avg = avg.slice(0, -1);
				}
				document.getElementById('score-average-' + _id).innerHTML = avg;
				min_el.addClass('ignored');
				max_el.addClass('ignored');
				this.reCalFinal(_id);
				return;
			}
		}
		document.getElementById('score-average-' + _id).innerHTML = '';
		document.getElementById('score-final-' + _id).innerHTML = '';
	},
	reCalFinal: function(_id) {
		var v_s = document.getElementById('score-average-' + _id).innerHTML;
		var v = parseFloat(v_s);
		var p = parseFloat(document.getElementById('pi-' + _id).value) || 0;
		if (v || (v_s == "0")) {
			var t = v * this.currentContest.tests[_id].factor - p;
			t = t.toFixed(2);
			while ((t.charAt(t.length-1) == "0") || (t.charAt(t.length-1) == ".")) {
				t = t.slice(0, -1);
			}
			document.getElementById('score-final-' + _id).innerHTML = t;

			// Total for all tests
			var tt = 0;
			for (t_id in this.currentContest.tests) {
				if (t_id == 'num') continue;
				var vv_s = document.getElementById('score-final-' + t_id).innerHTML;
				var vv = parseFloat(vv_s);
				if (vv || (vv_s == "0")) {
					tt += vv;
				} else {
					document.getElementById('score-final').innerHTML = '';
					return;
				}
			}
			document.getElementById('score-final').innerHTML = '' + tt;
		} else {
			document.getElementById('score-final-' + _id).innerHTML = '';
			document.getElementById('score-final').innerHTML = '';
		}
	},
	savePlayerAndScores: function() {
		var sql = 'UPDATE players SET notes="' + document.getElementById("player-notes").value + '" WHERE id=' + this.currentPlayerId;
		this.currentContestDb.executeSimpleSQL(sql);

		const p_sql_pre = 'INSERT INTO fscores(player_id, test_id, penalty, final) VALUES(';
		$(".penalty-i").each(function() {
			var penalty = parseFloat(this.value) || 0;
			var t_id = this.getAttribute("data-tid");
			var final_ = parseFloat(document.getElementById('score-final-' + t_id).innerHTML) || 0;
			var sql = p_sql_pre + NomrehChrome.currentPlayerId + ', ' + t_id + ', ' + penalty + ', ' + final_ + ')';
			NomrehChrome.currentContestDb.executeSimpleSQL(sql);
		});

		const s_sql_pre = 'INSERT INTO scores(player_id, judge_id, test_id, val) VALUES(';
		$(".score-i").each(function() {
			if (this.value) {
				NomrehChrome.currentContestDb.executeSimpleSQL(s_sql_pre + NomrehChrome.currentPlayerId + ', ' + this.getAttribute("data-jid") + ', ' + this.getAttribute("data-tid") + ', ' + this.value + ')');
			}
		});
	},
	nextPlayer: function() {
		var catchNext = false;
		for (p_order in this.currentContest.players) {
			var p = this.currentContest.players[p_order];
			if (catchNext) {
				this.selectPlayer(document.getElementById("player-li-" + p.id).firstChild);
				catchNext = false;
				break;
			} else if (this.currentPlayerId == p.id) {
				catchNext = true;
			}
		}
		if (catchNext) {
			this.newPlayer();
		}
	},
	deletePlayer: function() {
		let statement = this.currentContestDb.createStatement("SELECT fname, lname FROM players WHERE id=" + this.currentPlayerId);
		statement.executeStep();
		if (this.prompts.confirm(window, this.getMessage("nomreh.delete_title", [statement.row.fname + ' ' + statement.row.lname], 1),
							this.getMessage("nomreh.delete_sure"))) {

			$(this.scoringPanelDiv).hide();

			var sql = 'DELETE FROM players WHERE id=' + this.currentPlayerId;
			this.currentContestDb.executeSimpleSQL(sql);
			this.currentPlayerId = 0;

			this.loadContestDb({'players': true, 'callback': this.loadPlayersList});
		}
	},
	playerFNameModified: function(element, new_val) {
		let el = $(element);
		this.currentContestDb.executeSimpleSQL('UPDATE players SET fname="' + new_val + '" WHERE id=' + this.currentPlayerId);
		this.loadContestDb({'players': true, 'callback': this.loadPlayersList});
	},
	playerLNameModified: function(element, new_val) {
		let el = $(element);
		this.currentContestDb.executeSimpleSQL('UPDATE players SET lname="' + new_val + '" WHERE id=' + this.currentPlayerId);
		this.loadContestDb({'players': true, 'callback': this.loadPlayersList});
	},
	playerOrgModified: function(element, new_val) {
		let el = $(element);
		this.currentContestDb.executeSimpleSQL('UPDATE players SET org="' + new_val + '" WHERE id=' + this.currentPlayerId);
	},
    getMessage: function(msg, ar) {
		try {
			return this.strings.getMessage(msg, ar);
		} catch (e) {
			alert(null, "Error reading string resource: " + msg); // Do not localize!
		}
    },
	strings: {
		_sbs: Cc["@mozilla.org/intl/stringbundle;1"]
			.getService(Ci.nsIStringBundleService)
			.createBundle("chrome://nomreh/locale/nomreh.properties"),

		getMessage: function(msg, ar) {
			if (ar) {
				return this._sbs.formatStringFromName(msg, ar, ar.length)
			} else {
				return this._sbs.GetStringFromName(msg);
			}
		}
	}
};
