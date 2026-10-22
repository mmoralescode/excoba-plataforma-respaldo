import curriculum from "./curriculum.json";
import baseQuestions from "./questions.json";
import simulatorExpansion from "./simulator-expansion.json";
import coverageExpansion from "./coverage-expansion.json";
import interactiveExpansion from "./interactive-expansion.json";
import reinforcementExpansion from "./reinforcement-expansion.json";
const questions: typeof baseQuestions = [
  ...baseQuestions,
  ...simulatorExpansion,
  ...coverageExpansion,
  ...interactiveExpansion,
  ...reinforcementExpansion,
];
export { curriculum, questions };
