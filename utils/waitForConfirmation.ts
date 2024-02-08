import readline from "readline";

type ActionFunction = () => void | Promise<void>;

export const waitForConfirmation = async (
  skippableFunction?: ActionFunction
): Promise<boolean> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptMessage = skippableFunction
    ? "Proceed?  y(yes) /n(no) /s(skip) "
    : "Proceed? y(yes)/ n(no) ";

  return new Promise<boolean>((resolve) => {
    rl.question(promptMessage, async (ans: string) => {
      rl.close();
      const response = ans.toLowerCase();

      if (response === "y") {
        console.log("\n");
        if (skippableFunction) {
          await skippableFunction();
        }
        resolve(true);
      } else if (response === "s" && skippableFunction) {
        console.log("Skipping...\n");
        resolve(false);
      } else if (response === "n" || !skippableFunction) {
        console.log("Exiting process...");
        process.exit();
      } else {
        console.log("Invalid response. Exiting process...");
        process.exit();
      }
    });
  });
};
