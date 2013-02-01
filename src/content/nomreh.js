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
	goto: function(page, subpage) {
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
				this.currentContestDb.createTable("penalties", "player_id INTEGER, test_id INTEGER, val REAL, UNIQUE(player_id, test_id) ON CONFLICT REPLACE");

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
			html += "<td class='nomreh-editable' data-dbid='" + _id + "' onclick=\"NomrehChrome.edit(this, 'testFactorModified', 'testFactorInput');\">" + t_factor + "</td>";
			html +=	"<td><a class='btn btn-small btn-danger' onclick='NomrehChrome.removeTest(";
			html += _id + ")'><i class='icon-white icon-remove'></i></a></td></tr>";
		}
		let ph = this.getMessage("nomreh.new_test_ph");
		html += "<tr><td colspan='3' class='form-inline'>";
		html += "<input id='new-test-title' type='text' placeholder='" + ph + "' onkeyup='NomrehChrome.newTest(event, this)' /> ";
		html += "<input id='new-test-factor' type='number' value='1.0' onkeyup='return NomrehChrome.newTest(event, this);'"
		html += " onkeypress='return NomrehChrome.testFactorInput(event, this);' class='input-small' />";
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
	},
	editKeyUp: function(event, element, on_change, on_keyup) {
		var keyCode = ('which' in event) ? event.which : event.keyCode;

		if (on_keyup) {
			let res = NomrehChrome[on_keyup].call(this, element, event, keyCode);
			if (! res) {
				return false;
			}
		}

		if ((keyCode == 13) || (keyCode == 27)) {
			el = $(element);
			let val = el.attr("original");
			let p = el.parent();
			if (keyCode == 13) {
				val = element.value.trim();
			}
			p.html(val);
			p.removeAttr("last_editing")
			p.removeAttr("editing");
			if (keyCode == 13 && on_change) {
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
	testFactorInput: function(event, element) {
		if (event.metaKey) {
			return true;
		}
		var keyCode = ('which' in event) ? event.which : event.keyCode;

		if (! (keyCode in VALID_DECIMAL_KEYS)) {
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
			let statement = this.currentContestDb.createStatement("SELECT count(*) AS c FROM penalties WHERE test_id=" + _id);
			statement.executeStep();
		}
		if (statement.row.c > 0) {
			let statement = this.currentContestDb.createStatement("SELECT title FROM tests WHERE id=" + _id);
			statement.executeStep();
			if (this.prompts.confirm(window, this.getMessage("nomreh.delete_title", [statement.row.title]),
								this.getMessage("nomreh.delete_test_sure"))) {
				this.showLoading();
				this.currentContestDb.executeSimpleSQL("DELETE FROM scores WHERE test_id=" + _id);
				this.currentContestDb.executeSimpleSQL("DELETE FROM penalties WHERE test_id=" + _id);
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
		this.currentPlayerId = statement.row.new_id;
		var html = '<li id="player-li-' + this.currentPlayerId + '"><a data-dbid="' + this.currentPlayerId;
		html += '" href="#" onclick="NomrehChrome.selectPlayer(this)">' + p.fname + ' ' + p.lname + '</a></li>';
		this.playersUl.innerHTML += html;
		this.selectPlayer(document.getElementById("player-li-" + this.currentPlayerId).firstChild);
	},
	selectPlayer: function(element) {
		this.showLoading();
		$("#players-ul .active").removeClass('active');
		var el = $(element);
		el.parent().addClass('active');
		this.currentPlayerId = el.attr("data-dbid");
		let statement = this.currentContestDb.createStatement("SELECT fname, lname, org, notes FROM players WHERE id=" + this.currentPlayerId);
		statement.executeStep();
		document.getElementById("player-fname").innerHTML = statement.row.fname;
		document.getElementById("player-lname").innerHTML = statement.row.lname;
		document.getElementById("player-org").innerHTML = statement.row.org;
		document.getElementById("player-notes").value = statement.row.notes;
		$(this.scoringPanelDiv).show();
		this.hideLoading();
	},
	nextPlayer: function() {
		// TODO
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
