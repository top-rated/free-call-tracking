interface CommonOptions {
    onError?: (err: Error) => void;
    logger?: Logger;
}

type Lead = {
    hash: string;
    email: string;
    emails: string[];
    length: number;
};

const userToEmail = (user: GoogleAppsScript.Base.User) => user.getEmail();

const getEditors = () => SpreadsheetApp.getActiveSpreadsheet().getEditors();

const getOwner = ({ onError = console.warn }: CommonOptions = {}) => {
    try {
        return SpreadsheetApp.getActiveSpreadsheet().getOwner();
    } catch (error) {
        onError(error);
        return null;
    }
};

const getAdminEmails = ({
    onError = console.warn,
}: CommonOptions = {}): string[] => {
    const emails = [];

    try {
        emails.push(...getEditors().map(userToEmail));
    } catch (error) {
        onError(error);
    }

    return uniqify(emails).sort();
};

const getStatusMsg = (resp: GoogleAppsScript.URL_Fetch.HTTPResponse): boolean =>
    JSON.parse(resp.getContentText()).status;

const toCodeMsg = (resp: GoogleAppsScript.URL_Fetch.HTTPResponse): string =>
    `${resp.getResponseCode()} | ${resp.getContentText()}`;

const getHash = (uid: string, owner: string, emails: string[]) =>
    Utilities.base64Encode(
        Utilities.computeDigest(
            Utilities.DigestAlgorithm.MD5,
            `${uid}/${owner}/${emails.join(",")}`
        )
    );

const recordNewOwner = ({
    logger = makeLogger(),
    onError = (err) => console.warn(err),
}: CommonOptions = {}) => {
    const {
        logging: { users },
    } = APP_CONFIG;

    try {
        const emails = getAdminEmails({ onError });

        const user = getOwner({ onError });
        if (!user) return false;

        const ownerEmail = userToEmail(user);

        const {
            properties: { lead: prop },
        } = APP_CONFIG;

        const { uid: savedUid, hash: savedHash } = JSON.parse(
            getProperty(prop, "{}")
        );

        if (savedUid && savedHash === getHash(savedUid, ownerEmail, emails)) {
            logger.log("already recorded, no changes").dump();
            return true;
        }

        const uid = savedUid || Utilities.getUuid();
        const hash = getHash(uid, ownerEmail, emails);

        const lead: Lead = {
            hash,
            email: ownerEmail,
            emails,
            length: emails.length,
        };

        const resp = UrlFetchApp.fetch(`${users}?action=lead`, {
            muteHttpExceptions: true,
            method: "post",
            payload: JSON.stringify(lead),
            contentType: "application/json",
        });

        const status = resp.getResponseCode();
        const text = resp.getContentText();

        if (status !== 200) {
            logger.log(`[${status}] failed to record owner: ${text}`).dump();
            return false;
        }

        logger.log(`web app responded: ${getStatusMsg(resp)}`).dump();

        const val = { uid, hash };

        return setProperty(prop, val);
    } catch (error) {
        onError(error);
        logger.dump();
        return false;
    }
};
