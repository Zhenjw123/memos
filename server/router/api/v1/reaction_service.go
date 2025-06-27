package v1

import (
	"context"
	"fmt"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func (s *APIV1Service) ListMemoReactions(ctx context.Context, request *v1pb.ListMemoReactionsRequest) (*v1pb.ListMemoReactionsResponse, error) {
	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{
		ContentID: &request.Name,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reactions")
	}

	response := &v1pb.ListMemoReactionsResponse{
		Reactions: []*v1pb.Reaction{},
	}
	for _, reaction := range reactions {
		reactionMessage, err := s.convertReactionFromStore(ctx, reaction)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to convert reaction")
		}
		response.Reactions = append(response.Reactions, reactionMessage)
	}
	return response, nil
}

func (s *APIV1Service) UpsertMemoReaction(ctx context.Context, request *v1pb.UpsertMemoReactionRequest) (*v1pb.Reaction, error) {
	user, err := s.GetCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user")
	}

	// 获取被点赞的 memo 信息
	memoUID, err := ExtractMemoUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get memo")
	}

	reaction, err := s.Store.UpsertReaction(ctx, &store.Reaction{
		CreatorID:    user.ID,
		ContentID:    request.Reaction.ContentId,
		ReactionType: request.Reaction.ReactionType,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to upsert reaction")
	}

	// 如果不是自己给自己的 memo 点 reaction，创建 activity 和 inbox 消息
	if user.ID != memo.CreatorID {
		activity, err := s.Store.CreateActivity(ctx, &store.Activity{
			CreatorID: user.ID,
			Type:      store.ActivityTypeMemoReaction,
			Level:     store.ActivityLevelInfo,
			Payload: &storepb.ActivityPayload{
				MemoReaction: &storepb.ActivityMemoReactionPayload{
					MemoId:       memo.ID,
					ReactionType: reaction.ReactionType,
				},
			},
		})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to create activity")
		}
		if _, err := s.Store.CreateInbox(ctx, &store.Inbox{
			SenderID:   user.ID,
			ReceiverID: memo.CreatorID,
			Status:     store.UNREAD,
			Message: &storepb.InboxMessage{
				Type:       storepb.InboxMessage_MEMO_REACTION,
				ActivityId: &activity.ID,
			},
		}); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to create inbox")
		}
	}

	reactionMessage, err := s.convertReactionFromStore(ctx, reaction)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to convert reaction")
	}
	return reactionMessage, nil
}

func (s *APIV1Service) DeleteMemoReaction(ctx context.Context, request *v1pb.DeleteMemoReactionRequest) (*emptypb.Empty, error) {
	if err := s.Store.DeleteReaction(ctx, &store.DeleteReaction{
		ID: request.Id,
	}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete reaction")
	}

	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) convertReactionFromStore(ctx context.Context, reaction *store.Reaction) (*v1pb.Reaction, error) {
	creator, err := s.Store.GetUser(ctx, &store.FindUser{
		ID: &reaction.CreatorID,
	})
	if err != nil {
		return nil, err
	}
	return &v1pb.Reaction{
		Id:           reaction.ID,
		Creator:      fmt.Sprintf("%s%d", UserNamePrefix, creator.ID),
		ContentId:    reaction.ContentID,
		ReactionType: reaction.ReactionType,
	}, nil
}
