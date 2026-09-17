import type { Types } from "mongoose";
import {
  AutomationActionEnum,
  AutomationEventEnum,
  AutomationRule,
  AvailableAutomationActions,
  AvailableAutomationConditionFields,
  AvailableAutomationEvents,
  AvailableAutomationFields,
  AvailableAutomationOperators,
  MAX_ACTIONS_PER_RULE,
  MAX_CONDITIONS_PER_RULE,
  MAX_RULES_PER_PROJECT,
  type IAutomationAction,
  type IAutomationCondition,
  type IAutomationTrigger,
} from "../models/automationrule.models.js";
import { AutomationRun } from "../models/automationrun.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { runRuleNow } from "../utils/automation.js";
import { MAX_LABEL_LENGTH, MAX_TASK_LABELS } from "../utils/constants.js";
import { toObjectId } from "../utils/object-id.js";
import { requireUser } from "../utils/request-user.js";
import { isValidTimeZone } from "../utils/sprint-report.js";

type ProjectParams = { projectId: string };
type RuleParams = ProjectParams & { ruleId: string };

const MAX_TEXT = 500;
const MAX_RUNS = 100;

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/** Rejects anything the schema would silently drop, with a readable message */
const parseTrigger = (body: Record<string, unknown>): IAutomationTrigger => {
  const raw = (body.trigger ?? {}) as Record<string, unknown>;
  const event = asString(raw.event);
  if (!AvailableAutomationEvents.includes(event as never)) {
    throw new ApiError(422, "Pick a trigger");
  }
  const trigger: IAutomationTrigger = { event: event as never };

  if (event === AutomationEventEnum.TASK_CHANGED) {
    const field = asString(raw.field);
    if (field && !AvailableAutomationFields.includes(field as never)) {
      throw new ApiError(422, "That field can't be watched");
    }
    if (field) trigger.field = field as never;
    if (asString(raw.to)) trigger.to = asString(raw.to);
    if (asString(raw.from)) trigger.from = asString(raw.from);
  }

  if (event === AutomationEventEnum.SCHEDULE) {
    const frequency = asString(raw.frequency) || "daily";
    if (frequency !== "daily" && frequency !== "weekly") {
      throw new ApiError(422, "Schedule must be daily or weekly");
    }
    const hour = Number(raw.hour ?? 9);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new ApiError(422, "Hour must be between 0 and 23");
    }
    trigger.frequency = frequency;
    trigger.hour = hour;
    if (frequency === "weekly") {
      const weekday = Number(raw.weekday ?? 1);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new ApiError(422, "Weekday must be between 0 and 6");
      }
      trigger.weekday = weekday;
    }
    const timeZone = asString(raw.timeZone);
    if (timeZone) {
      if (!isValidTimeZone(timeZone)) {
        throw new ApiError(422, "Time zone is invalid");
      }
      trigger.timeZone = timeZone;
    }
  }

  return trigger;
};

const parseConditions = (body: Record<string, unknown>) => {
  const raw = Array.isArray(body.conditions) ? body.conditions : [];
  if (raw.length > MAX_CONDITIONS_PER_RULE) {
    throw new ApiError(
      422,
      `A rule can have at most ${MAX_CONDITIONS_PER_RULE} conditions`,
    );
  }
  return raw.map((entry): IAutomationCondition => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const field = asString(item.field);
    const op = asString(item.op);
    if (!AvailableAutomationConditionFields.includes(field as never)) {
      throw new ApiError(422, "A condition names an unknown field");
    }
    if (!AvailableAutomationOperators.includes(op as never)) {
      throw new ApiError(422, "A condition uses an unknown test");
    }
    const value = asString(item.value);
    const needsValue = op !== "is_empty" && op !== "is_not_empty";
    if (needsValue && !value) {
      throw new ApiError(422, "A condition is missing its value");
    }
    return {
      field: field as never,
      op: op as never,
      ...(needsValue && { value: value.slice(0, MAX_TEXT) }),
    };
  });
};

const parseLabels = (value: unknown) => {
  const list = Array.isArray(value) ? value : [];
  return [
    ...new Set(
      list
        .map((label) => asString(label).slice(0, MAX_LABEL_LENGTH))
        .filter(Boolean),
    ),
  ].slice(0, MAX_TASK_LABELS);
};

const parseActions = (body: Record<string, unknown>) => {
  const raw = Array.isArray(body.actions) ? body.actions : [];
  if (raw.length === 0) throw new ApiError(422, "Add at least one action");
  if (raw.length > MAX_ACTIONS_PER_RULE) {
    throw new ApiError(
      422,
      `A rule can have at most ${MAX_ACTIONS_PER_RULE} actions`,
    );
  }
  return raw.map((entry): IAutomationAction => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const type = asString(item.type);
    if (!AvailableAutomationActions.includes(type as never)) {
      throw new ApiError(422, "An action is of an unknown kind");
    }
    const action: IAutomationAction = { type: type as never };
    const value = asString(item.value);
    if (value) action.value = value.slice(0, MAX_TEXT);
    const text = asString(item.text);
    if (text) action.text = text.slice(0, MAX_TEXT);
    if (asString(item.taskType)) action.taskType = asString(item.taskType) as never;

    if (type === AutomationActionEnum.SET_DUE_DATE && item.days !== null) {
      const days = Number(item.days ?? 0);
      if (!Number.isInteger(days) || Math.abs(days) > 365) {
        throw new ApiError(422, "Due date offset must be within a year");
      }
      action.days = days;
    }
    if (
      type === AutomationActionEnum.ADD_LABELS ||
      type === AutomationActionEnum.REMOVE_LABELS
    ) {
      action.labels = parseLabels(item.labels);
      if (action.labels.length === 0) {
        throw new ApiError(422, "Name at least one label");
      }
    }
    if (
      (type === AutomationActionEnum.ADD_COMMENT ||
        type === AutomationActionEnum.CREATE_TASK) &&
      !action.text
    ) {
      throw new ApiError(
        422,
        type === AutomationActionEnum.CREATE_TASK
          ? "The new task needs a title"
          : "The comment needs some text",
      );
    }
    return action;
  });
};

const ruleBody = (body: Record<string, unknown>) => {
  const name = asString(body.name);
  if (!name) throw new ApiError(422, "Name the rule");
  return {
    name: name.slice(0, 120),
    enabled: body.enabled !== false,
    trigger: parseTrigger(body),
    conditions: parseConditions(body),
    actions: parseActions(body),
  };
};

const findRule = async (projectId: string, ruleId: string) => {
  const rule = await AutomationRule.findOne({
    _id: toObjectId(ruleId, "rule id"),
    project: toObjectId(projectId, "project id"),
  });
  if (!rule) throw new ApiError(404, "Rule not found");
  return rule;
};

/** GET /automations/:projectId */
const getAutomationRules = asyncHandler<ProjectParams>(async (req, res) => {
  const rules = await AutomationRule.find({
    project: toObjectId(req.params.projectId, "project id"),
  })
    .sort({ createdAt: 1 })
    .lean();
  return res.status(200).json(new ApiResponse(200, rules, "Automation rules"));
});

/** POST /automations/:projectId */
const createAutomationRule = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const project = toObjectId(req.params.projectId, "project id");
  const count = await AutomationRule.countDocuments({ project });
  if (count >= MAX_RULES_PER_PROJECT) {
    throw new ApiError(
      400,
      `A project can have at most ${MAX_RULES_PER_PROJECT} rules`,
    );
  }
  const rule = await AutomationRule.create({
    ...ruleBody(req.body),
    project,
    createdBy: currentUser._id,
  });
  return res.status(201).json(new ApiResponse(201, rule, "Rule created"));
});

/** PUT /automations/:projectId/r/:ruleId */
const updateAutomationRule = asyncHandler<RuleParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const rule = await findRule(req.params.projectId, req.params.ruleId);
  // Just flipping the switch doesn't need the whole rule sent back
  if (
    Object.keys(req.body).length === 1 &&
    typeof req.body.enabled === "boolean"
  ) {
    rule.enabled = req.body.enabled;
  } else {
    Object.assign(rule, ruleBody(req.body));
  }
  rule.updatedBy = currentUser._id;
  await rule.save();
  return res.status(200).json(new ApiResponse(200, rule, "Rule updated"));
});

/** DELETE /automations/:projectId/r/:ruleId */
const deleteAutomationRule = asyncHandler<RuleParams>(async (req, res) => {
  const rule = await findRule(req.params.projectId, req.params.ruleId);
  await Promise.all([
    AutomationRule.deleteOne({ _id: rule._id }),
    AutomationRun.deleteMany({ rule: rule._id }),
  ]);
  return res.status(200).json(new ApiResponse(200, {}, "Rule deleted"));
});

/**
 * POST /automations/:projectId/r/:ruleId/run — runs a scheduled rule now, so
 * people can see what it does without waiting for its hour.
 */
const runAutomationRule = asyncHandler<RuleParams>(async (req, res) => {
  const rule = await findRule(req.params.projectId, req.params.ruleId);
  if (rule.trigger.event !== AutomationEventEnum.SCHEDULE) {
    throw new ApiError(400, "Only scheduled rules can be run by hand");
  }
  await runRuleNow(rule.toObject() as never);
  return res.status(200).json(new ApiResponse(200, {}, "Rule ran"));
});

/** GET /automations/:projectId/runs?rule=&limit= */
const getAutomationRuns = asyncHandler<ProjectParams>(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, MAX_RUNS);
  const ruleId = typeof req.query.rule === "string" ? req.query.rule : "";
  const filter: Record<string, Types.ObjectId> = {
    project: toObjectId(req.params.projectId, "project id"),
  };
  if (ruleId) filter.rule = toObjectId(ruleId, "rule id");

  const runs = await AutomationRun.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return res.status(200).json(new ApiResponse(200, runs, "Automation runs"));
});

export {
  createAutomationRule,
  deleteAutomationRule,
  getAutomationRules,
  getAutomationRuns,
  runAutomationRule,
  updateAutomationRule,
};
