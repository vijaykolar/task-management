import { Notification } from "../models/notification.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { toObjectId } from "../utils/object-id.js";
import { facetPage, fromFacet, parseListQuery } from "../utils/pagination.js";
import { requireUser } from "../utils/request-user.js";

/** GET /notifications?page&limit&unread=true — newest first, plus unreadCount */
const getNotifications = asyncHandler(async (req, res) => {
  const currentUser = requireUser(req);
  const query = parseListQuery(req.query, {
    sortFields: ["createdAt"] as const,
    defaultSort: "createdAt",
    defaultLimit: 20,
    maxLimit: 50,
  });

  const filter = {
    recipient: currentUser._id,
    ...(req.query.unread === "true" && { readAt: { $exists: false } }),
  };

  const [result, unreadCount] = await Promise.all([
    Notification.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1, _id: -1 } },
      facetPage(query, [
        {
          $lookup: {
            from: "users",
            localField: "actor",
            foreignField: "_id",
            as: "actor",
            pipeline: [
              { $project: { _id: 1, username: 1, fullName: 1, avatar: 1 } },
            ],
          },
        },
        { $addFields: { actor: { $arrayElemAt: ["$actor", 0] } } },
      ]),
    ]),
    Notification.countDocuments({
      recipient: currentUser._id,
      readAt: { $exists: false },
    }),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { ...fromFacet(result, query), unreadCount },
        "Notifications fetched",
      ),
    );
});

const markNotificationRead = asyncHandler<{ notificationId: string }>(
  async (req, res) => {
    const currentUser = requireUser(req);
    const notification = await Notification.findOneAndUpdate(
      {
        _id: toObjectId(req.params.notificationId, "notification id"),
        recipient: currentUser._id,
      },
      { $set: { readAt: new Date() } },
      { new: true },
    );

    if (!notification) {
      throw new ApiError(404, "Notification not found");
    }
    return res
      .status(200)
      .json(new ApiResponse(200, notification, "Marked as read"));
  },
);

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const currentUser = requireUser(req);
  const result = await Notification.updateMany(
    { recipient: currentUser._id, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updated: result.modifiedCount },
        "All notifications marked as read",
      ),
    );
});

export { getNotifications, markAllNotificationsRead, markNotificationRead };
