import { body, type ValidationChain } from "express-validator";
import {
  AvailableTaskPriorities,
  AvailableTaskStatues,
  AvailableUserRole,
} from "../utils/constants.js";
import { parseDueDate, parseLabels } from "../utils/task-fields.js";
import { prepareRichText } from "../utils/rich-text.js";

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything past 72 bytes, so longer passwords give a false
// sense of security
export const PASSWORD_MAX_BYTES = 72;

/** Password strength rules, shared by register / reset / change */
const strongPassword = (field: string, label = "Password") =>
  body(field)
    // No trim: spaces are valid password characters
    .isString()
    .withMessage(`${label} is required`)
    .bail()
    .notEmpty()
    .withMessage(`${label} is required`)
    .bail()
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(
      `${label} must be at least ${PASSWORD_MIN_LENGTH} characters long`,
    )
    .custom((value: string) => Buffer.byteLength(value) <= PASSWORD_MAX_BYTES)
    .withMessage(`${label} must be at most ${PASSWORD_MAX_BYTES} characters`)
    .matches(/[A-Za-z]/)
    .withMessage(`${label} must contain at least one letter`)
    .matches(/\d/)
    .withMessage(`${label} must contain at least one number`);

const userRegisterValidator = (): ValidationChain[] => {
  return [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Email is invalid"),
    body("username")
      .trim()
      .notEmpty()
      .withMessage("Username is required")
      .isLowercase()
      .withMessage("Username must be in lower case")
      .isLength({ min: 3 })
      .withMessage("Username must be at least 3 characters long"),
    strongPassword("password"),
    body("fullName").optional().trim(),
  ];
};

const updateAccountValidator = (): ValidationChain[] => {
  return [
    body("fullName")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 80 })
      .withMessage("Full name must be at most 80 characters"),
    body("emailNotifications")
      .optional()
      .isBoolean()
      .withMessage("emailNotifications must be true or false")
      .toBoolean(),
    body("username").not().exists().withMessage("Username can't be changed"),
    body().custom((value) => {
      if (
        value?.fullName === undefined &&
        value?.emailNotifications === undefined
      ) {
        throw new Error("Nothing to update");
      }
      return true;
    }),
  ];
};

const userLoginValidator = (): ValidationChain[] => {
  return [
    body("email").optional().isEmail().withMessage("Email is invalid"),
    body("password").notEmpty().withMessage("Password is required"),
  ];
};

const userChangeCurrentPasswordValidator = (): ValidationChain[] => {
  return [
    body("oldPassword").notEmpty().withMessage("Current password is required"),
    strongPassword("newPassword", "New password")
      .custom((value: string, { req }) => value !== req.body.oldPassword)
      .withMessage("New password must be different from the current one"),
  ];
};

const userForgotPasswordValidator = (): ValidationChain[] => {
  return [
    body("email")
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Email is invalid"),
  ];
};

const userResetForgotPasswordValidator = (): ValidationChain[] => {
  return [strongPassword("newPassword")];
};

const createProjectValidator = (): ValidationChain[] => {
  return [
    body("name").notEmpty().withMessage("Name is required"),
    body("description").optional(),
  ];
};

const addMembertoProjectValidator = (): ValidationChain[] => {
  return [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Email is invalid"),
    body("role")
      .notEmpty()
      .withMessage("Role is required")
      .isIn(AvailableUserRole)
      .withMessage("Role is invalid"),
  ];
};

const transferOwnershipValidator = (): ValidationChain[] => {
  return [
    body("userId")
      .notEmpty()
      .withMessage("Choose the new owner")
      .isMongoId()
      .withMessage("User id is invalid"),
  ];
};

const taskFieldValidators = (isCreate: boolean): ValidationChain[] => {
  const title = body("title").trim();
  return [
    (isCreate
      ? title.notEmpty().withMessage("Title is required")
      : title.optional().notEmpty().withMessage("Title cannot be empty")
    )
      .isLength({ max: 200 })
      .withMessage("Title must be at most 200 characters"),
    body("description")
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage("Description must be at most 5000 characters"),
    body("status")
      .optional()
      .isIn(AvailableTaskStatues)
      .withMessage("Status is invalid"),
    // An empty value unassigns the task
    body("assignedTo")
      .optional({ values: "falsy" })
      .isMongoId()
      .withMessage("Assignee is invalid"),
    body("priority")
      .optional()
      .isIn(AvailableTaskPriorities)
      .withMessage("Priority is invalid"),
    // An empty value clears the due date
    body("dueDate")
      .optional()
      .custom((value) => {
        parseDueDate(value);
        return true;
      }),
    body("labels")
      .optional()
      .custom((value) => {
        parseLabels(value);
        return true;
      }),
    // "" or "backlog" removes the task from its sprint
    body("sprint")
      .optional({ values: "falsy" })
      .custom((value) => value === "backlog" || /^[0-9a-f]{24}$/i.test(value))
      .withMessage("Sprint is invalid"),
  ];
};

const createTaskValidator = (): ValidationChain[] => taskFieldValidators(true);

const updateTaskValidator = (): ValidationChain[] => taskFieldValidators(false);

const createSubtaskValidator = (): ValidationChain[] => {
  return [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Title is required")
      .isLength({ max: 200 })
      .withMessage("Title must be at most 200 characters"),
  ];
};

const updateSubtaskValidator = (): ValidationChain[] => {
  return [
    body("title")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Title cannot be empty")
      .isLength({ max: 200 })
      .withMessage("Title must be at most 200 characters"),
    body("isCompleted")
      .optional()
      .isBoolean()
      .withMessage("isCompleted must be a boolean")
      .toBoolean(),
  ];
};

/** Rich text HTML: must have visible text, limited by its plain-text length */
const richTextField = (field: string, label: string, maxChars: number) =>
  body(field)
    .isString()
    .withMessage(`${label} is required`)
    .bail()
    .isLength({ max: 200_000 })
    .withMessage(`${label} is too long`)
    .bail()
    .custom((value: string) => prepareRichText(value).text.length > 0)
    .withMessage(`${label} can't be empty`)
    .custom((value: string) => prepareRichText(value).text.length <= maxChars)
    .withMessage(
      `${label} must be at most ${maxChars.toLocaleString("en-US")} characters`,
    );

const noteValidator = (): ValidationChain[] => {
  return [richTextField("content", "Note", 10_000)];
};

const commentValidator = (): ValidationChain[] => {
  return [richTextField("body", "Comment", 5_000)];
};

const sprintValidator = (): ValidationChain[] => {
  return [
    body("name")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 80 })
      .withMessage("Sprint name must be at most 80 characters"),
    body("goal")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Sprint goal must be at most 500 characters"),
    body("startDate")
      .optional()
      .custom((value) => {
        parseDueDate(value);
        return true;
      }),
    body("endDate")
      .optional()
      .custom((value) => {
        parseDueDate(value);
        return true;
      }),
  ];
};

export {
  sprintValidator,
  commentValidator,
  transferOwnershipValidator,
  updateAccountValidator,
  createTaskValidator,
  updateTaskValidator,
  createSubtaskValidator,
  updateSubtaskValidator,
  noteValidator,
  userRegisterValidator,
  userLoginValidator,
  userChangeCurrentPasswordValidator,
  userForgotPasswordValidator,
  userResetForgotPasswordValidator,
  createProjectValidator,
  addMembertoProjectValidator,
};
