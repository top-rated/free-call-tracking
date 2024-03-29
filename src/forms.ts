type Errable<T> = T & { onError?: (err: Error) => void };

type FormSheetRemovalOpts = Errable<{ key: string }>;

const decodeVars = (url: string) =>
    url
        .replace(/%7B%7B(\w+)\+(\w+)%7D%7D/gi, "{{$1 $2}}")
        .replace(/%7B%7B(\w+)%7D%7D/gi, "{{$1}}");

/**
 * @summary prefills form URL with variables
 */
const getPrefilledUrl = (sFormId: string): FormInfo => {
    const defaults: FormInfo = { sFormId: "", sUrl: "" };

    try {
        const form = FormApp.openById(sFormId);
        const items = form.getItems();

        const formResponse = form.createResponse();

        const setResponse = makeResponseSetter(formResponse);

        const {
            tagManager: {
                variables: { clid, time, uagent, title, geo },
            },
        } = APP_CONFIG;

        const [iTime, iClid, iGeo, iRef, iHost, iTitle, iAgent] = items;

        setResponse(iTime, `{{${time}}}`);
        setResponse(iClid, `{{${clid}}}`);
        setResponse(iGeo, `{{${geo}}}`);
        setResponse(iRef, "{{Referrer}}");
        setResponse(iHost, "{{Page Hostname}}{{Page Path}}");
        setResponse(iTitle, `{{${title}}}`);
        setResponse(iAgent, `{{${uagent}}}`);

        // Get prefilled form URL
        const url = formResponse
            .toPrefilledUrl()
            .replace("viewform", "formResponse");

        const sUrl = decodeVars(url);

        return Object.assign(defaults, { sFormId, sUrl });
    } catch (error) {
        console.warn(`failed to prefill URL: ${error}`);
        return defaults;
    }
};

type FormInfo = {
    sFormId: string;
    sUrl: string;
};

/**
 * @summary syncs spreadsheet formatting
 */
const syncFormatting = (sh: GoogleAppsScript.Spreadsheet.Sheet) => {
    const run = makeRunTimes(6);
    run((i) => sh.autoResizeColumn(i + 1));
    sh.getRange("E2:E").setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sh.getRange("H2:H").setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sh.hideColumns(2, 3);
};

/**
 * @summary formats form sheet
 */
const formatFormSheet = () => {
    const sh = getFormSheet();
    sh && syncFormatting(sh);
};

/**
 * @summary creates a form to be used with the Add-on
 */
function createForm(sMyCategory: string, sMyEvent: string): FormInfo {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sCurrFormUrl = ss.getFormUrl();

    const {
        strings: {
            form: {
                userAgent,
                pageTitle,
                currPage,
                prevPage,
                geoLocation,
                timestamp,
                visitorId,
                name,
            },
            errors: {
                form: { duplicate, inaccessible },
            },
        },
    } = APP_CONFIG;

    if (sCurrFormUrl) {
        let canAccess = true;

        try {
            const existing = FormApp.openByUrl(sCurrFormUrl);
            return getPrefilledUrl(existing.getId());
        } catch (error) {
            console.warn(error);
            canAccess = false;
        }

        showMsg(duplicate + (canAccess ? "" : nl`${inaccessible}`));

        return { sFormId: "", sUrl: "" };
    }

    const form = FormApp.create(name).setAllowResponseEdits(false);

    try {
        form.setRequireLogin(false);
    } catch (error) {
        console.warn(error);
    }

    form.addTextItem().setTitle(timestamp);
    form.addTextItem().setTitle(visitorId);
    form.addTextItem().setTitle(geoLocation);
    form.addTextItem().setTitle(prevPage);
    form.addTextItem().setTitle(currPage);
    form.addTextItem().setTitle(pageTitle);
    form.addTextItem().setTitle(userAgent);

    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

    SpreadsheetApp.flush();

    const [sh] = ss.getSheets();

    sh.setName(sSHEET_FORM);

    syncFormatting(sh);

    sh.getRange("I2:I" + sh.getMaxRows()).setDataValidation(
        SpreadsheetApp.newDataValidation()
            .setAllowInvalid(false)
            .requireValueInList(
                [toEventPair(), toEventPair(sMyCategory, sMyEvent)],
                true
            )
            .build()
    );

    return getPrefilledUrl(form.getId());
}

type NoAnalyticsStatus = {
    status: boolean;
    dismissed: boolean;
    deployed: boolean;
}

/**
 * @summary fires on manual analytics form being submitted
 */
function onFormSubmit({
    values,
    range,
    onError = console.warn,
}: Errable<GoogleAppsScript.Events.SheetsOnFormSubmit>) {
    try {
        const sheet = range.getSheet();

        const [_fstamp, _tstamp, clientId] = values;

        const {
            properties: { metadata: key },
        } = APP_CONFIG;

        const noGAmeta: NoAnalyticsStatus = getMetadataValue({
            key,
            sheet,
            def: makeNoGAstatus(),
        });

        if (!clientId) {
            const { dismissed = false }: NoAnalyticsStatus = noGAmeta;
            if (dismissed) return;
            noGAmeta.status = true;
        }

        setMetadataValue({
            sheet,
            key,
            value: noGAmeta,
        });

        if (isFirstActionableRowEmpty(sheet)) removeFirstActionableRow(sheet);
    } catch (error) {
        onError(error);
    }
}

/**
 * @summary deletes sheet with linked form and associated metadata
 */
const deleteFormSheet = ({
    onError = console.warn,
    key,
}: FormSheetRemovalOpts) => {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(sSHEET_FORM);

        if (sheet) {
            deleteMetadata({ sheet, key });
            ss.deleteSheet(sheet);
        }

        return true;
    } catch (error) {
        onError(error);
        return false;
    }
};

/**
 * @summary deletes linked form
 */
const unlinkForm = ({ onError = console.warn }: Errable<{}>) => {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();

        const uri = ss.getFormUrl();

        if (!uri) return true;

        const form = FormApp.openByUrl(uri);

        form.removeDestination();

        return true;
    } catch (error) {
        onError(error);
        return false;
    }
};
