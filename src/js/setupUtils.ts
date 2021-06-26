interface EventListener {
    (evt: Event): void | Promise<void>;
}

((w, d) => {
    // /**
    //  * @summary event listener for changing Ads group visibility
    //  */
    // const changeAdsFormVisibility: EventListener = (event) => {
    //     const {
    //         target: { checked },
    //     } = event;

    //     const adsForm = $("#gAdsSetup"),
    //         duration = 100;

    //     checked ? adsForm.show(duration) : adsForm.hide(duration);
    // };

    async function deployAddon(preloader: HTMLElement) {
        const ids = [
            "account",
            "property",
            "profile",
            "gtm-account",
            "gtm-container",
            "gtm-workspace",
        ];

        const [
            gaAccount,
            gaProperty,
            gaProfile,
            gtmAccountPath,
            gtmContainerPath,
            gtmWorkspacePath,
        ] = ids.map(
            (id) => document.getElementById<HTMLSelectElement>(id)?.value
        );

        // const willLinkAds = $("#gAdsSwitch").is(":checked");
        // const willCreateGoal = $("#createGoal").is(":checked");

        const issues = [];

        if (!gaAccount) issues.push("Please select an Analytics Account!");
        if (!gaProperty) issues.push("Please select an Analytics Property!");
        if (!gtmAccountPath)
            issues.push("Please select a Tag Manager Account!");
        if (!gtmContainerPath) issues.push("Please select a Container!");
        if (!gtmWorkspacePath) issues.push("Please select a Workspace!");
        // if (willLinkAds && !adsAccount)
        //     issues.push("Please select an Ads Account");

        // if (willCreateGoal && !gaProfile)
        //     issues.push(`Please select an Analytics Profile!`);

        const { failure } = config.classes.notify;

        if (issues.length) return issues.forEach((msg) => notify(msg, failure));

        show(preloader);

        disable("submit");

        // if (willLinkAds) {
        //     await run({
        //         funcName: "linkAllAccounts",
        //         onFailure: () =>
        //             showError(
        //                 `Failed to link your Ads accounts!`,
        //                 config.times.notify.slow
        //             ),
        //         onSuccess: ({ length }) => {
        //             notify(
        //                 `Linked ${length} Ads account${
        //                     length === 1 ? "" : "s"
        //                 }`,
        //                 config.times.notify.slow,
        //                 config.classes.notify.success
        //             );
        //         },
        //     });
        // }

        const gaCategory = $("#MyCategory").val() || "Call";
        const gaEvent = $("#MyEvent").val() || "Call";

        // if (willCreateGoal) {
        //     const goalStatus = await gscript("createEventGoal", {
        //         gaAccount,
        //         gaProperty,
        //         gaProfile,
        //         gaCategory,
        //         gaEvent,
        //     });

        //     goalStatus
        //         ? notify(
        //               `Created Analytics Goal`,
        //               config.times.notify.slow,
        //               config.classes.notify.success
        //           )
        //         : showError(`Failed to create Analytics Goal!`);
        // }

        try {
            await gscript("deployAddon", {
                gaAccount,
                gaProperty,
                gaProfile,
                gaCategory,
                gaEvent,
                gtmContainerPath,
                gtmWorkspacePath,
                gtmAccountPath,
            });

            google.script.host.close();
        } catch (error) {
            console.debug({ error });
            notify("Something went wrong");
        } finally {
            enable("submit");
            hide(preloader);
        }
    }

    w.addEventListener("load", async () => {
        const preloader = document.getElementById(config.ids.preloader)!;

        w.addEventListener("error", async ({ message }) => {
            await gscript("logException", "setup", message);
            notify("Something went wrong", config.classes.notify.failure);
            hide(preloader);
        });

        w.addEventListener("unhandledrejection", async ({ reason = "" }) => {
            await gscript("logException", "setup", reason.toString());
            notify("Something went wrong", config.classes.notify.failure);
            hide(preloader);
        });

        M.AutoInit();

        d.body.classList.remove("hidden");

        try {
            show(preloader);

            const {
                accounts: { analytics, tagManager },
            } = await gscript<AppSettings>("getSettings");

            await Promise.all([
                setupAnalytics(analytics),
                setupTagManager(tagManager),
            ]);
        } catch ({ message }) {
            await gscript("logException", "setup", message);
            notify("Something went wrong", config.classes.notify.failure);
        } finally {
            hide(preloader);
        }

        // const customers = await getAdsAccounts(
        //     ({ id, descriptiveName }) => ({
        //         name: descriptiveName,
        //         id,
        //     })
        // );

        const bouncedDeploy = debounce(deployAddon);

        const submitBtn = d.getElementById("submit")!;
        submitBtn.addEventListener("click", () => bouncedDeploy(preloader));

        const cancelBtn = d.getElementById("cancel")!;
        cancelBtn.addEventListener("click", () => google.script.host.close());
    });

    d.addEventListener("click", ({ target }) => {
        const el = <HTMLElement>target;
        if (!el.matches(".toast")) return;
        M.Toast.getInstance(el).dismiss();
    });
})(window, document);
