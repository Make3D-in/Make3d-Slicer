var isStealthMode = false;

function OnInit()
{
	TranslatePage();
	SelectWorkflow('online');
}

function SelectWorkflow(choice)
{
	if (choice === 'offline') {
		isStealthMode = true;
		$('#CardOffline').addClass('selected').removeClass('unselected');
		$('#CardOnline').addClass('unselected').removeClass('selected');
	} else {
		isStealthMode = false;
		$('#CardOnline').addClass('selected').removeClass('unselected');
		$('#CardOffline').addClass('unselected').removeClass('selected');
	}
	SendStealthModeCheck();
}

function SendStealthModeCheck()
{
	let nVal = isStealthMode ? "yes" : "no";
	
	var tSend = {};
	tSend['sequence_id'] = Math.round(new Date() / 1000);
	tSend['command'] = "save_stealth_mode";
	tSend['data'] = {};
	tSend['data']['action'] = nVal;
	
	SendWXMessage(JSON.stringify(tSend));

	return true;
}

function FinishGuideWithStealth()
{
	SendStealthModeCheck();
	FinishGuide();
}

function FinishGuide()
{
	var tSend = {};
	tSend['sequence_id'] = Math.round(new Date() / 1000);
	tSend['command'] = "user_guide_finish";
	tSend['data'] = {};
	tSend['data']['action'] = "finish";
	
	SendWXMessage(JSON.stringify(tSend));	
}
