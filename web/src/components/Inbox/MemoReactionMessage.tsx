import { Tooltip } from "@mui/joy";
import { Laugh, InboxIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import useNavigateTo from "@/hooks/useNavigateTo";
import { activityServiceClient } from "@/grpcweb";
import { Activity } from "@/types/proto/api/v1/activity_service";
import { Inbox, Inbox_Status } from "@/types/proto/api/v1/inbox_service";
import { Memo } from "@/types/proto/api/v1/memo_service";
import { User } from "@/types/proto/api/v1/user_service";
import { useTranslate } from "@/utils/i18n";
import { activityNamePrefix, useMemoStore } from "@/store/v1";
import { userStore } from "@/store/v2";
import useAsyncEffect from "@/hooks/useAsyncEffect";
import { cn } from "@/utils";

interface Props {
  inbox: Inbox;
}

const MemoReactionMessage = ({ inbox }: Props) => {
  const t = useTranslate();
  const navigateTo = useNavigateTo();
  const memoStore = useMemoStore();
  const [initialized, setInitialized] = useState<boolean>(false);
  const [sender, setSender] = useState<User | undefined>(undefined);
  const [activity, setActivity] = useState<Activity | undefined>(undefined);
  const [relatedMemo, setRelatedMemo] = useState<Memo | undefined>(undefined);

  useAsyncEffect(async () => {
    if (!inbox.activityId) {
      return;
    }

    try {
      const activity = await activityServiceClient.getActivity({
        name: `${activityNamePrefix}${inbox.activityId}`,
      });
      if (activity.payload?.memoReaction) {
        const memoReactionPayload = activity.payload.memoReaction;
        const memo = await memoStore.getOrFetchMemoByName(memoReactionPayload.memo, {
          skipStore: true,
        });
        setRelatedMemo(memo);
        const sender = await userStore.getOrFetchUserByName(inbox.sender);
        setSender(sender);
        setActivity(activity);
        setInitialized(true);
      }
    } catch (error) {
      console.error("Failed to fetch activity details:", error);
    }
  }, [inbox.activityId]);

  const handleNavigateToMemo = async () => {
    if (!relatedMemo) {
      return;
    }

    navigateTo(`/${relatedMemo.name}`);
    if (inbox.status === Inbox_Status.UNREAD) {
      handleArchiveMessage(true);
    }
  };

  const handleArchiveMessage = async (silence = false) => {
    await userStore.updateInbox(
      {
        name: inbox.name,
        status: Inbox_Status.ARCHIVED,
      },
      ["status"],
    );
    if (!silence) {
      toast.success(t("message.archived-successfully"));
    }
  };

  if (!initialized || !sender || !activity?.payload?.memoReaction || !relatedMemo) {
    return null;
  }

  return (
    <div className="w-full flex flex-row justify-start items-start gap-3">
      <div
        className={cn(
          "shrink-0 mt-2 p-2 rounded-full border",
          inbox.status === Inbox_Status.UNREAD
            ? "border-blue-600 text-blue-600 bg-blue-50 dark:bg-zinc-800"
            : "border-gray-500 text-gray-500 bg-gray-50 dark:bg-zinc-800",
        )}
      >
        <Tooltip title={"Reaction"} placement="bottom">
          <Laugh className="w-4 sm:w-5 h-auto" />
        </Tooltip>
      </div>
      <div
        className={cn(
          "border w-full p-2 px-3 rounded-lg flex flex-col justify-start items-start gap-1 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-700",
          inbox.status !== Inbox_Status.UNREAD && "opacity-60",
        )}
      >
        {initialized ? (
          <>
            <div className="w-full flex flex-row justify-between items-center">
              <span className="text-sm text-gray-500">{inbox.createTime?.toLocaleString()}</span>
              <div>
                {inbox.status === Inbox_Status.UNREAD && (
                  <Tooltip title={t("common.archive")} placement="top">
                    <InboxIcon
                      className="w-4 h-auto cursor-pointer text-gray-400 hover:text-blue-600"
                      onClick={() => handleArchiveMessage()}
                    />
                  </Tooltip>
                )}
              </div>
            </div>
            <div className="w-full flex flex-row items-center gap-2">
              <span
                className="cursor-pointer text-blue-600 hover:opacity-80"
                onClick={() => navigateTo(`/u/${sender.name.split("/").pop()}`)}
              >
                {sender.nickname || sender.username}
              </span>
              <span className="text-gray-500">{t("memo.react.reacted-with")}</span>
              <span className="text-lg">
                {activity.payload.memoReaction.reactionType}
              </span>
              <span className="text-gray-500">{t("memo.react.to-your-note")}</span>
            </div>
            <div
              className="w-full p-2 bg-gray-50 dark:bg-zinc-800 rounded border-l-4 border-blue-500 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700"
              onClick={handleNavigateToMemo}
            >
              <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
                {relatedMemo.content || "No content"}
              </p>
            </div>
          </>
        ) : (
          <div className="w-full flex flex-row justify-center items-center my-2">
            <LoaderIcon className="animate-spin text-zinc-500" />
          </div>
        )}
      </div>
    </div>
  );
};

export default MemoReactionMessage;
