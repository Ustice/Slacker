$(function(){
    function countSelectedActions(){
        return $("input[type=checkbox][ id$=command]:checked").length;
    }

    function getSelectedActionIndices(){
        var selectedCheckboxIds = [];
        $("input[type=checkbox][ id$=command]:checked").each(function(){selectedCheckboxIds.push($(this).attr('id').split("-")[0])});
        return selectedCheckboxIds;
    }

    $("input[type=checkbox][ id$=command]").click(function(){
        var numActionsSelected = countSelectedActions();
        if(numActionsSelected){
            $("button#submitButton").prop('disabled', false);
        }
        else{
            $("button#submitButton").prop('disabled', true);
        }
    });
});
