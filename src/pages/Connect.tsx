import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  MessageSquare,
  Heart,
  UserPlus,
  UserCheck,
  UserMinus,
  Search,
  Star,
  Send,
  ArrowRight,
  Eye,
  AlertCircle,
  CheckCircle,
  Filter,
  Zap,
  FolderPlus,
  Share2,
  Briefcase,
  TrendingUp,
  Clock,
  ChevronRight,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface Creator {
  id: string;
  name: string;
  avatar_url: string;
  tier: string;
  followers: number;
  bio: string;
  followed: boolean;
  created_at: string;
  category?: string;
}

interface Member {
  id: string;
  name: string;
  avatar_url: string;
  tier: string;
  bio: string;
  followers: number;
  category?: string;
  connected: boolean;
  requestStatus?: 'sent' | 'received' | 'none'; // 'sent' = you sent request, 'received' = you received request, 'none' = no request
}

interface Connection {
  id: string;
  name: string;
  avatar_url: string;
  role: string;
  bio: string;
  followers?: number;
  isFollowing: boolean;
}

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string;
  content: string;
  timestamp: string;
  read: boolean;
}

interface Group {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  category: string;
  member_count: number;
  visibility: string;
}

interface Team {
  id: string;
  name: string;
  description: string;
  avatar_url: string;
  member_count: number;
  verified: boolean;
  industry: string;
}

interface Recommendation {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string;
  bio: string;
  reason: string;
  score: number;
}

interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

// Professional categories from Projects page
const PROFESSIONAL_CATEGORIES = [
  'all',
  'digital-marketing',
  'brand-ambassador',
  'media-communications',
  'media-production',
  'art-&-design',
  'modelling',
  'dance-&-choreography',
  'acting',
  'film-video-production',
  'audio-production',
  'music',
  'event-management',
  'photography',
  'design'
];

const SORT_OPTIONS = ['all', 'trending', 'new', 'popular'];

// Cache management functions
const getCachedCreators = () => {
  try {
    const cached = localStorage.getItem('connect_creators_cache');
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

const setCachedCreators = (data: Creator[]) => {
  try {
    localStorage.setItem('connect_creators_cache', JSON.stringify(data));
  } catch {
    // Silently fail if localStorage is unavailable
  }
};

const getCachedMembers = () => {
  try {
    const cached = localStorage.getItem('connect_members_cache');
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

const setCachedMembers = (data: Member[]) => {
  try {
    localStorage.setItem('connect_members_cache', JSON.stringify(data));
  } catch {
    // Silently fail if localStorage is unavailable
  }
};

export default function Connect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'discover' | 'network' | 'groups' | 'teams' | 'messages'>('discover');
  const [discoverSubTab, setDiscoverSubTab] = useState<'creators' | 'members' | 'recommendations'>('creators');
  
  // Data states
  const [creators, setCreators] = useState<Creator[]>(() => getCachedCreators() || []);
  const [members, setMembers] = useState<Member[]>(() => getCachedMembers() || []);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  // Filter & Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSort, setSelectedSort] = useState<string>('trending');
  const [creatorsLoaded, setCreatorsLoaded] = useState(() => getCachedCreators() !== null);
  const [membersLoaded, setMembersLoaded] = useState(() => getCachedMembers() !== null);
  
  // UI states
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingRequests, setPendingRequests] = useState<{ [key: string]: boolean }>({});
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [portfolioCreatorId, setPortfolioCreatorId] = useState<string | null>(null);
  const [portfolioData, setPortfolioData] = useState<any>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  // Dynamic header based on filters
  const getCreatorHeader = () => {
    const sortLabel = selectedSort.charAt(0).toUpperCase() + selectedSort.slice(1);
    const categoryLabel = selectedCategory === 'all' 
      ? 'Creators' 
      : selectedCategory.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    return `${sortLabel === 'All' ? '' : sortLabel + ' '}${categoryLabel}`;
  };

  useEffect(() => {
    if (user?.role === 'member') {
      loadCreators();
      // Always load members fresh to get accurate connection counts
      // Don't rely on cache for connection data
      loadMembers();
      loadConnections();
      loadMessages();
      loadGroups();
      loadTeams();
      loadRecommendations();
    }
  }, [user]);

  // Real-time subscriptions for follow status changes from other pages and follower count updates
  useEffect(() => {
    if (!user?.id) return;

    // Subscribe to member_connections changes (follow from Connect page)
    const memberConnectionsSubscription = supabase
      .channel(`member_connections_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'member_connections',
          filter: `member_id=eq.${user.id}`,
        },
        () => {
          // Reload creators when follow status changes
          loadCreators();
        }
      )
      .subscribe();

    // Subscribe to media_page_follows changes (follow from Media page)
    const mediaFollowsSubscription = supabase
      .channel(`media_page_follows_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'media_page_follows',
          filter: `follower_id=eq.${user.id}`,
        },
        () => {
          // Reload creators when follow status changes from Media page
          loadCreators();
        }
      )
      .subscribe();

    // Subscribe to profiles table changes (creator and member follower count updates from other users)
    const profilesSubscription = supabase
      .channel('profiles_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload: any) => {
          // Update both creators and members when their follower count changes
          const updatedProfile = payload.new;

          // Update creators
          setCreators((prevCreators) => {
            const updated = prevCreators.map((creator) =>
              creator.id === updatedProfile.id
                ? { ...creator, followers: updatedProfile.followers }
                : creator
            );
            setCachedCreators(updated);
            return updated;
          });

          // Update members
          setMembers((prevMembers) => {
            const updated = prevMembers.map((member) =>
              member.id === updatedProfile.id
                ? { ...member, followers: updatedProfile.followers }
                : member
            );
            setCachedMembers(updated);
            return updated;
          });
        }
      )
      .subscribe();

    // Subscribe to ALL member_connections changes (not just current user's) to update connection counts in real-time
    // This ensures that when anyone connects/disconnects, the connection counts for ALL members are recalculated
    const memberConnectionsStatusSubscription = supabase
      .channel('member_connections_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'member_connections',
        },
        (payload: any) => {
          // When ANY member connection changes, update connection status and connection counts
          // Clear cache since connection counts are dynamic and change with any member connection
          try {
            localStorage.removeItem('connect_members_cache');
          } catch (e) {
            // Silently fail if localStorage not available
          }

          // Update members state with fresh data from database
          loadMembers();

          // If the current user was involved in the connection, also update their connections list
          const changedMemberId = payload.new?.member_id || payload.old?.member_id;
          const changedConnectedId = payload.new?.connected_user_id || payload.old?.connected_user_id;

          if (changedMemberId === user?.id || changedConnectedId === user?.id) {
            loadConnections();
          }
        }
      )
      .subscribe();

    // Subscribe to connection_requests changes (accept/decline/pending requests)
    const connectionRequestsSubscription = supabase
      .channel('connection_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connection_requests',
        },
        (payload: any) => {
          // Clear cache and reload members when connection requests change
          try {
            localStorage.removeItem('connect_members_cache');
          } catch (e) {
            // Silently fail if localStorage not available
          }

          // Reload members to update request status and connection status
          loadMembers();

          // If current user received a request, notify them
          const recipientId = payload.new?.recipient_id || payload.old?.recipient_id;

          if (recipientId === user?.id && payload.new?.status === 'pending') {
            // Only show toast for new pending requests
            addToast('You have a new connection request', 'success');
          }
        }
      )
      .subscribe();

    return () => {
      memberConnectionsSubscription.unsubscribe();
      mediaFollowsSubscription.unsubscribe();
      profilesSubscription.unsubscribe();
      memberConnectionsStatusSubscription.unsubscribe();
      connectionRequestsSubscription.unsubscribe();
    };
  }, [user?.id]);

  const loadCreators = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, tier, followers, bio, created_at')
        .eq('account_type', 'creator')
        .limit(100);

      if (!error && data) {
        // Check which creators the user is following from member_connections table
        const { data: memberConnectionsData } = await supabase
          .from('member_connections')
          .select('connected_user_id')
          .eq('member_id', user?.id)
          .eq('connection_type', 'follow');

        const followedViaConnectionIds = new Set(memberConnectionsData?.map(f => f.connected_user_id) || []);

        // Check which creators the user is following from media_page_follows table
        const { data: mediaFollowsData } = await supabase
          .from('media_page_follows')
          .select('creator_name')
          .eq('follower_id', user?.id);

        const followedViaMediaNames = new Set(mediaFollowsData?.map(f => f.creator_name) || []);

        // A creator is followed if they're followed via either table
        const creatorsWithFollowStatus = data.map((creator: any) => ({
          ...creator,
          followed: followedViaConnectionIds.has(creator.id) || followedViaMediaNames.has(creator.name),
        }));
        setCreators(creatorsWithFollowStatus);
        setCachedCreators(creatorsWithFollowStatus);
        setCreatorsLoaded(true);
      }
    } catch (error) {
      console.error('Error loading creators:', error);
      addToast('Failed to load creators', 'error');
    }
  };

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, tier, bio')
        .eq('account_type', 'member')
        .neq('id', user?.id) // Exclude current user directly in query to avoid showing them
        .limit(50);

      if (!error && data) {
        // Check bidirectional connections:
        // 1. Members the current user connected to
        // 2. Members who connected to the current user
        const { data: outgoingConnections } = await supabase
          .from('member_connections')
          .select('connected_user_id')
          .eq('member_id', user?.id)
          .eq('connection_type', 'colleague');

        const { data: incomingConnections } = await supabase
          .from('member_connections')
          .select('member_id')
          .eq('connected_user_id', user?.id)
          .eq('connection_type', 'colleague');

        // A member is "connected" if current user connected to them OR they connected to current user
        const connectedWithIds = new Set([
          ...(outgoingConnections?.map(c => c.connected_user_id) || []),
          ...(incomingConnections?.map(c => c.member_id) || []),
        ]);

        // Get fresh connection counts for each member from database
        // CRITICAL FIX: Count connections in BOTH directions
        // A member's connection count = times they appear as member_id + times they appear as connected_user_id
        const { data: allConnectionsData } = await supabase
          .from('member_connections')
          .select('member_id, connected_user_id')
          .eq('connection_type', 'colleague');

        const connectionCounts = new Map<string, number>();
        allConnectionsData?.forEach((conn: any) => {
          // Count when they appear as connected_user_id (others connected TO them)
          connectionCounts.set(conn.connected_user_id, (connectionCounts.get(conn.connected_user_id) || 0) + 1);
          // ALSO count when they appear as member_id (they connected to others)
          connectionCounts.set(conn.member_id, (connectionCounts.get(conn.member_id) || 0) + 1);
        });

        // Get pending connection requests sent BY the current user
        const { data: sentRequests } = await supabase
          .from('connection_requests')
          .select('recipient_id')
          .eq('sender_id', user?.id)
          .eq('status', 'pending');

        const sentRequestsMap: { [key: string]: boolean } = {};
        sentRequests?.forEach((req: any) => {
          sentRequestsMap[req.recipient_id] = true;
        });
        setPendingRequests(sentRequestsMap);

        // Get pending connection requests RECEIVED BY the current user
        const { data: receivedRequests } = await supabase
          .from('connection_requests')
          .select('sender_id')
          .eq('recipient_id', user?.id)
          .eq('status', 'pending');

        const receivedRequestsMap: { [key: string]: boolean } = {};
        receivedRequests?.forEach((req: any) => {
          receivedRequestsMap[req.sender_id] = true;
        });

        // Build members list with fresh connection data
        const membersWithConnectionStatus = data.map((member: any) => {
          let requestStatus: 'sent' | 'received' | 'none' = 'none';
          if (receivedRequestsMap[member.id]) {
            requestStatus = 'received'; // You received a request from this member
          } else if (sentRequestsMap[member.id]) {
            requestStatus = 'sent'; // You sent a request to this member
          }

          return {
            ...member,
            followers: connectionCounts.get(member.id) || 0, // Fresh count from database (both directions)
            connected: connectedWithIds.has(member.id), // Bidirectional connection check
            requestStatus, // Can be 'sent', 'received', or 'none'
          };
        });

        setMembers(membersWithConnectionStatus);

        // Cache only the base member data without connection counts to avoid stale data
        // Connection counts are dynamic and change frequently, so they should never be cached
        const membersForCache = data.map((member: any) => ({
          ...member,
          connected: false, // Reset to false in cache
        }));
        setCachedMembers(membersForCache);
        setMembersLoaded(true);
      }
    } catch (error) {
      console.error('Error loading members:', error);
    }
  };


  const loadConnections = async () => {
    try {
      if (!user?.id) {
        console.error('User ID not available for loadConnections');
        return;
      }

      console.log('Loading connections for user:', user.id);

      // Step 1: Get IDs of all members the current user is connected to (in either direction)
      // Method 1: Members where current user is the member_id (current user created the connection)
      const { data: outgoingConnections, error: outgoingError } = await supabase
        .from('member_connections')
        .select('connected_user_id')
        .eq('member_id', user.id)
        .eq('connection_type', 'colleague')
        .eq('status', 'active');

      if (outgoingError) {
        console.error('Error loading outgoing connections:', outgoingError);
      }

      // Method 2: Members where current user is the connected_user_id (they created the connection)
      const { data: incomingConnections, error: incomingError } = await supabase
        .from('member_connections')
        .select('member_id')
        .eq('connected_user_id', user.id)
        .eq('connection_type', 'colleague')
        .eq('status', 'active');

      if (incomingError) {
        console.error('Error loading incoming connections:', incomingError);
      }

      // Collect all connected user IDs
      const connectedUserIds = new Set<string>([
        ...(outgoingConnections?.map(c => c.connected_user_id) || []),
        ...(incomingConnections?.map(c => c.member_id) || []),
      ]);

      console.log('Connected user IDs:', Array.from(connectedUserIds));

      // Step 2: Fetch profile data for all connected users
      const connectionsList: Connection[] = [];

      if (connectedUserIds.size > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, avatar_url, account_type, bio, followers')
          .in('id', Array.from(connectedUserIds));

        if (profilesError) {
          console.error('Error loading profiles:', profilesError);
        }

        profiles?.forEach((profile: any) => {
          connectionsList.push({
            id: profile.id,
            name: profile.name || 'Unknown',
            avatar_url: profile.avatar_url || '',
            role: profile.account_type || 'member',
            bio: profile.bio || '',
            followers: profile.followers || 0,
            isFollowing: true,
          });
        });
      }

      console.log('Final connected members list:', connectionsList);
      setConnections(connectionsList);
    } catch (error) {
      console.error('Error loading connections:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, content, timestamp, read, sender:sender_id (name, avatar_url)')
        .eq('recipient_id', user?.id)
        .order('timestamp', { ascending: false })
        .limit(50);

      if (!error && data) {
        const messagesList = data.map((msg: any) => ({
          ...msg,
          sender_name: msg.sender?.name || 'Unknown',
          sender_avatar: msg.sender?.avatar_url || '',
        }));
        setMessages(messagesList);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const loadGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, description, avatar_url, category, member_count, visibility')
        .eq('visibility', 'public')
        .limit(12);

      if (!error && data) {
        setGroups(data || []);
      }
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const loadTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, description, avatar_url, member_count, verified, industry')
        .eq('visibility', 'public')
        .limit(12);

      if (!error && data) {
        setTeams(data || []);
      }
    } catch (error) {
      console.error('Error loading teams:', error);
    }
  };

  const loadRecommendations = async () => {
    try {
      const { data, error } = await supabase
        .from('connection_recommendations')
        .select('id, recommended_user_id, reason, score, profiles:recommended_user_id (id, name, avatar_url, bio)')
        .eq('user_id', user?.id)
        .eq('dismissed', false)
        .order('score', { ascending: false })
        .limit(10);

      if (!error && data) {
        const recList = data.map((rec: any) => ({
          id: rec.id,
          user_id: rec.recommended_user_id,
          name: rec.profiles?.name || 'Unknown',
          avatar_url: rec.profiles?.avatar_url || '',
          bio: rec.profiles?.bio || '',
          reason: rec.reason,
          score: rec.score,
        }));
        setRecommendations(recList);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    }
  };

  const handleFollowCreator = async (creator: Creator) => {
    try {
      // Insert into member_connections (for Connect page)
      const { error: connectionError } = await supabase.from('member_connections').insert({
        member_id: user?.id,
        connected_user_id: creator.id,
        connection_type: 'follow',
        status: 'active',
      });

      // Insert into media_page_follows (for Media page sync and consistency)
      const { error: mediaError } = await supabase.from('media_page_follows').insert({
        follower_id: user?.id,
        creator_name: creator.name,
      }).select();

      if (!connectionError && !mediaError) {
        // Update local state
        setCreators(
          creators.map((c) =>
            c.id === creator.id ? { ...c, followed: true } : c
          )
        );

        addToast(`Now following ${creator.name}`, 'success');

        // Reload creators to get updated follower count from database triggers
        setTimeout(() => loadCreators(), 1000);
      } else {
        addToast('Failed to follow creator', 'error');
      }
    } catch (error) {
      console.error('Error following creator:', error);
      addToast('Failed to follow creator', 'error');
    }
  };

  const handleUnfollowCreator = async (creatorId: string) => {
    try {
      // Find the creator name for media_page_follows deletion
      const creatorToUnfollow = creators.find(c => c.id === creatorId);
      if (!creatorToUnfollow) {
        addToast('Creator not found', 'error');
        return;
      }

      // Delete from member_connections (for Connect page)
      const { error: connectionError } = await supabase
        .from('member_connections')
        .delete()
        .eq('member_id', user?.id)
        .eq('connected_user_id', creatorId);

      // Delete from media_page_follows (for Media page sync)
      const { error: mediaError } = await supabase
        .from('media_page_follows')
        .delete()
        .eq('follower_id', user?.id)
        .eq('creator_name', creatorToUnfollow.name);

      if (!connectionError && !mediaError) {
        // Update local state
        setCreators(
          creators.map((c) =>
            c.id === creatorId ? { ...c, followed: false } : c
          )
        );

        addToast('Unfollowed creator', 'success');

        // Reload creators to get updated follower count from database triggers
        setTimeout(() => loadCreators(), 1000);
      } else {
        addToast('Failed to unfollow creator', 'error');
      }
    } catch (error) {
      console.error('Error unfollowing creator:', error);
      addToast('Failed to unfollow creator', 'error');
    }
  };

  const handleViewCreatorPortfolio = async (creatorId: string) => {
    try {
      setPortfolioLoading(true);

      // Check if creator's portfolio is public
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', creatorId)
        .single();

      if (error) {
        console.error('Error loading creator profile:', error);
        addToast('Creator profile not found', 'error');
        setPortfolioLoading(false);
        return;
      }

      // Check if portfolio is public (if column doesn't exist, default to allowing view)
      // portfolio_visibility will be null if the column hasn't been added to the database yet
      const isPublic = profile.portfolio_visibility === 'public' || profile.portfolio_visibility === null;
      if (profile.portfolio_visibility === 'private') {
        addToast('This creator has not made their portfolio public', 'error');
        setPortfolioLoading(false);
        return;
      }

      // Load portfolio projects
      const { data: projects, error: projectsError } = await supabase
        .from('portfolio_projects')
        .select('*')
        .eq('profile_id', creatorId)
        .order('created_at', { ascending: false });

      if (projectsError) {
        console.error('Error loading projects:', projectsError);
      }

      // Load portfolio skills
      const { data: skills, error: skillsError } = await supabase
        .from('portfolio_skills')
        .select('*')
        .eq('profile_id', creatorId);

      if (skillsError) {
        console.error('Error loading skills:', skillsError);
      }

      // Store portfolio data and open modal
      const portfolioInfo = {
        profile,
        projects: projects || [],
        skills: skills || []
      };
      console.log('Portfolio data loaded:', portfolioInfo);
      setPortfolioData(portfolioInfo);
      setPortfolioCreatorId(creatorId);
      setPortfolioModalOpen(true);
      setPortfolioLoading(false);
    } catch (error) {
      console.error('Error viewing creator portfolio:', error);
      addToast('Failed to load portfolio', 'error');
      setPortfolioLoading(false);
    }
  };

  const handleConnectMember = async (member: Member) => {
    try {
      // Check if user is authenticated
      if (!user?.id) {
        console.error('User not authenticated');
        addToast('You must be logged in to send connection requests', 'error');
        return;
      }

      // Only block if a PENDING request already exists (prevent duplicate key error)
      const { data: existingRequest } = await supabase
        .from('connection_requests')
        .select('id, status')
        .eq('sender_id', user.id)
        .eq('recipient_id', member.id)
        .eq('status', 'pending')
        .single();

      if (existingRequest) {
        console.log('Pending request already exists:', existingRequest);
        addToast('You already sent a pending request to this member', 'error');
        setTimeout(() => loadMembers(), 300);
        return;
      }

      console.log('Sending connection request:', { sender_id: user.id, recipient_id: member.id });

      // Create a new connection request
      const { error } = await supabase.from('connection_requests').insert({
        sender_id: user.id,
        recipient_id: member.id,
        message: null,
        status: 'pending',
      });

      if (error) {
        console.error('Database error:', error.code, error.message, error.details);
        // If we still get a unique constraint error, it means a race condition occurred
        if (error.code === '23505') {
          addToast('This request was already sent (race condition detected)', 'error');
          setTimeout(() => loadMembers(), 300);
        } else {
          addToast(`Failed to send connection request: ${error.message}`, 'error');
        }
        return;
      }

      // Success: Update local state immediately
      setMembers(
        members.map((m) =>
          m.id === member.id ? { ...m, requestStatus: 'sent' } : m
        )
      );

      addToast(`Connection request sent to ${member.name}`, 'success');

      // Reload members to get fresh request status from database
      setTimeout(() => {
        loadMembers();
        loadConnections();
      }, 500);
    } catch (error) {
      console.error('Error sending connection request:', error);
      addToast('Failed to send connection request', 'error');
    }
  };

  const handleCancelConnectionRequest = async (memberId: string) => {
    try {
      if (!user?.id) {
        addToast('You must be logged in', 'error');
        return;
      }

      // Delete the connection request sent BY current user
      const { error } = await supabase
        .from('connection_requests')
        .delete()
        .eq('sender_id', user.id)
        .eq('recipient_id', memberId);

      if (error) {
        console.error('Error canceling request:', error);
        addToast('Failed to cancel request', 'error');
        return;
      }

      // Update local state
      setMembers(
        members.map((m) =>
          m.id === memberId ? { ...m, requestStatus: 'none' } : m
        )
      );

      addToast('Connection request cancelled', 'success');
      setTimeout(() => loadMembers(), 300);
    } catch (error) {
      console.error('Error canceling connection request:', error);
      addToast('Failed to cancel request', 'error');
    }
  };

  const handleAcceptConnectionRequest = async (memberId: string) => {
    try {
      // Find the connection request from this member to current user
      const { data: requests } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('sender_id', memberId)
        .eq('recipient_id', user?.id)
        .eq('status', 'pending');

      if (requests && requests.length > 0) {
        // Update the request status to accepted
        const { error: updateError } = await supabase
          .from('connection_requests')
          .update({ status: 'accepted' })
          .eq('id', requests[0].id);

        if (!updateError) {
          // Create the actual connection in member_connections
          // CRITICAL: member_id MUST be auth.uid() (current user) to pass RLS policy
          const { error: connectionError } = await supabase
            .from('member_connections')
            .insert({
              member_id: user?.id,  // Current user (acceptor)
              connected_user_id: memberId,  // The requester
              connection_type: 'colleague',
              status: 'active',
            });

          if (connectionError) {
            console.error('Error creating connection:', connectionError.code, connectionError.message);
            addToast('Connection accepted but failed to create connection', 'error');
            setTimeout(() => loadMembers(), 500);
            return;
          }

          // Clear cache
          try {
            localStorage.removeItem('connect_members_cache');
          } catch (e) {
            // Silently fail if localStorage not available
          }

          // Update UI immediately - add to connections and update members
          const memberToConnect = members.find(m => m.id === memberId);
          if (memberToConnect) {
            setConnections([
              ...connections,
              {
                id: memberToConnect.id,
                name: memberToConnect.name,
                avatar_url: memberToConnect.avatar_url,
                role: memberToConnect.role || 'member',
                bio: memberToConnect.bio,
                followers: memberToConnect.followers,
                isFollowing: true,
              }
            ]);
          }

          setMembers(
            members.map((m) =>
              m.id === memberId ? { ...m, connected: true, requestStatus: 'none' } : m
            )
          );

          addToast('Connection accepted', 'success');

          // Reload to sync with database
          setTimeout(() => {
            loadMembers();
            loadConnections();
          }, 500);
        }
      }
    } catch (error) {
      console.error('Error accepting connection request:', error);
      addToast('Failed to accept connection request', 'error');
    }
  };

  const handleDeclineConnectionRequest = async (memberId: string) => {
    try {
      // Find the connection request from this member to current user
      const { data: requests } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('sender_id', memberId)
        .eq('recipient_id', user?.id)
        .eq('status', 'pending');

      if (requests && requests.length > 0) {
        // Update the request status to rejected
        const { error: updateError } = await supabase
          .from('connection_requests')
          .update({ status: 'rejected' })
          .eq('id', requests[0].id);

        if (!updateError) {
          addToast('Connection request declined', 'success');
          setTimeout(() => loadMembers(), 500);
        }
      }
    } catch (error) {
      console.error('Error declining connection request:', error);
      addToast('Failed to decline connection request', 'error');
    }
  };

  const handleDisconnectMember = async (memberId: string) => {
    try {
      if (!user?.id) {
        addToast('You must be logged in', 'error');
        return;
      }

      // Delete connections in both directions to fully disconnect
      const { error: error1 } = await supabase
        .from('member_connections')
        .delete()
        .eq('member_id', user.id)
        .eq('connected_user_id', memberId)
        .eq('connection_type', 'colleague');

      const { error: error2 } = await supabase
        .from('member_connections')
        .delete()
        .eq('member_id', memberId)
        .eq('connected_user_id', user.id)
        .eq('connection_type', 'colleague');

      // Also delete/reset old connection request records to allow reconnection
      const { error: error3 } = await supabase
        .from('connection_requests')
        .delete()
        .eq('sender_id', user.id)
        .eq('recipient_id', memberId);

      const { error: error4 } = await supabase
        .from('connection_requests')
        .delete()
        .eq('sender_id', memberId)
        .eq('recipient_id', user.id);

      if (error1) console.error('Error disconnecting (direction 1):', error1);
      if (error2) console.error('Error disconnecting (direction 2):', error2);
      if (error3) console.error('Error deleting request (direction 1):', error3);
      if (error4) console.error('Error deleting request (direction 2):', error4);

      // Success if at least one delete worked
      if (!error1 || !error2) {
        // Clear cache
        try {
          localStorage.removeItem('connect_members_cache');
        } catch (e) {
          // Silently fail
        }

        // Update UI immediately - remove from connections and update members
        setConnections(
          connections.filter((c) => c.id !== memberId)
        );

        setMembers(
          members.map((m) =>
            m.id === memberId ? { ...m, connected: false, requestStatus: 'none' } : m
          )
        );

        addToast('Disconnected', 'success');

        // Reload to sync with database
        setTimeout(() => {
          loadMembers();
          loadConnections();
        }, 500);
      } else {
        addToast('Failed to disconnect', 'error');
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
      addToast('Failed to disconnect', 'error');
    }
  };

  const handleSendMessage = async () => {
    if (!selectedConnection || !messageInput.trim()) return;

    try {
      const { error } = await supabase.from('messages').insert({
        sender_id: user?.id,
        recipient_id: selectedConnection.id,
        content: messageInput,
        timestamp: new Date().toISOString(),
        read: false,
      });

      if (!error) {
        setMessageInput('');
        loadMessages();
        addToast('Message sent', 'success');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      addToast('Failed to send message', 'error');
    }
  };

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).substr(2, 9);
    const toast: Toast = { id, type, message };
    setToasts((prev) => [...prev, toast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Filter and sort creators (exclude followed ones from Discover)
  const filteredAndSortedCreators = creators
    .filter((creator) => {
      const matchesSearch =
        creator.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        creator.bio?.toLowerCase().includes(searchQuery.toLowerCase());
      const isNotFollowed = !creator.followed; // Exclude followed creators
      return matchesSearch && isNotFollowed;
    })
    .sort((a, b) => {
      if (selectedSort === 'trending') {
        return (b.followers || 0) - (a.followers || 0);
      } else if (selectedSort === 'new') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (selectedSort === 'popular') {
        return (b.followers || 0) - (a.followers || 0);
      }
      return 0;
    });

  // Filter members (exclude connected ones from Discover)
  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.bio?.toLowerCase().includes(searchQuery.toLowerCase());
    const isNotConnected = !member.connected; // Exclude connected members
    return matchesSearch && isNotConnected;
  });

  if (user?.role !== 'member') {
    return (
      <div className="min-h-screen pt-20 pb-12 px-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="max-w-7xl mx-auto text-center py-20">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <p className="text-gray-300 text-lg">This feature is available for community members only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 px-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="mb-4">
            <h1 className="text-4xl font-playfair font-bold text-white">Connect</h1>
          </div>
          <p className="text-gray-300 text-lg">
            Grow your network — connect with members, creators, groups, and teams
          </p>
        </div>

        {/* Main Tab Navigation */}
        <div className="flex gap-2 mb-8 border-b border-white/10 overflow-x-auto pb-0">
          {[
            { id: 'discover', label: 'Discover', icon: Eye },
            { id: 'network', label: 'My Network', icon: Users },
            { id: 'groups', label: 'Groups', icon: FolderPlus },
            { id: 'teams', label: 'Teams', icon: Briefcase },
            { id: 'messages', label: 'Messages', icon: MessageSquare },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`px-6 py-3 font-semibold transition-all capitalize whitespace-nowrap flex items-center gap-2 ${
                activeTab === id
                  ? 'text-rose-400 border-b-2 border-rose-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Discover Tab */}
        {activeTab === 'discover' && (
          <div className="space-y-8">
            {/* Sub-tabs for Discover */}
            <div className="flex gap-4 border-b border-white/10 pb-4">
              {['creators', 'members', 'recommendations'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDiscoverSubTab(tab as any)}
                  className={`px-4 py-2 font-semibold transition-all capitalize ${
                    discoverSubTab === tab
                      ? 'text-rose-400 border-b-2 border-rose-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab === 'creators' && '✨ Creators'}
                  {tab === 'members' && '👥 Members'}
                  {tab === 'recommendations' && '⚡ Recommended'}
                </button>
              ))}
            </div>

            {/* Search and Filters - Responsive layout */}
            {/* Mobile layout: stacked */}
            <div className="md:hidden space-y-3">
              {/* Search Bar - Full width on mobile */}
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search ${discoverSubTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-rose-400 focus:bg-white/10"
                />
              </div>

              {/* Creators: Filter Icon & Category Controls - Stacked on mobile */}
              {discoverSubTab === 'creators' && (
                <div className="flex gap-3 items-center flex-wrap">
                  {/* Filter Icon (just icon) */}
                  <button className="p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors border border-white/10 hover:border-rose-400/50 text-gray-300 hover:text-white flex-shrink-0">
                    <Filter className="w-5 h-5" />
                  </button>

                  {/* Sort Dropdown */}
                  <select
                    value={selectedSort}
                    onChange={(e) => setSelectedSort(e.target.value)}
                    className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-semibold focus:outline-none focus:border-rose-400 focus:bg-white/10 hover:border-white/20 transition-colors appearance-none cursor-pointer flex-shrink-0 text-sm"
                  >
                    <option value="all" className="bg-slate-900 text-white">Sort: All</option>
                    <option value="trending" className="bg-slate-900 text-white">Sort: Trending 🔥</option>
                    <option value="new" className="bg-slate-900 text-white">Sort: New ✨</option>
                    <option value="popular" className="bg-slate-900 text-white">Sort: Popular ⭐</option>
                  </select>

                  {/* Category Dropdown */}
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-semibold focus:outline-none focus:border-rose-400 focus:bg-white/10 hover:border-white/20 transition-colors appearance-none cursor-pointer flex-shrink-0 text-sm flex-1"
                  >
                    {PROFESSIONAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat} className="bg-slate-900 text-white">
                        {cat === 'all' ? 'All Categories' : cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Desktop layout: all on one line */}
            <div className="hidden md:flex gap-3 items-center">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search ${discoverSubTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-rose-400 focus:bg-white/10"
                />
              </div>

              {/* Creators: Filter Icon & Category Controls */}
              {discoverSubTab === 'creators' && (
                <>
                  {/* Filter Icon (just icon) */}
                  <button className="p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors border border-white/10 hover:border-rose-400/50 text-gray-300 hover:text-white flex-shrink-0">
                    <Filter className="w-5 h-5" />
                  </button>

                  {/* Sort Dropdown */}
                  <select
                    value={selectedSort}
                    onChange={(e) => setSelectedSort(e.target.value)}
                    className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-semibold focus:outline-none focus:border-rose-400 focus:bg-white/10 hover:border-white/20 transition-colors appearance-none cursor-pointer flex-shrink-0"
                  >
                    <option value="all" className="bg-slate-900 text-white">Sort: All</option>
                    <option value="trending" className="bg-slate-900 text-white">Sort: Trending 🔥</option>
                    <option value="new" className="bg-slate-900 text-white">Sort: New ✨</option>
                    <option value="popular" className="bg-slate-900 text-white">Sort: Popular ⭐</option>
                  </select>

                  {/* Category Dropdown */}
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-semibold focus:outline-none focus:border-rose-400 focus:bg-white/10 hover:border-white/20 transition-colors appearance-none cursor-pointer flex-shrink-0"
                  >
                    {PROFESSIONAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat} className="bg-slate-900 text-white">
                        {cat === 'all' ? 'All Categories' : cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {/* Creators Grid */}
            {discoverSubTab === 'creators' && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-6">{getCreatorHeader()}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredAndSortedCreators.length > 0 ? (
                    filteredAndSortedCreators.map((creator) => (
                        <div
                          key={creator.id}
                          className="glass-effect rounded-2xl p-6 border border-white/10 hover:border-rose-400/50 transition-all group"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={creator.avatar_url || 'https://via.placeholder.com/48'}
                                alt={creator.name}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                              <div>
                                <h3 className="text-lg font-bold text-white">{creator.name}</h3>
                                <div className="flex items-center gap-1 text-xs text-yellow-400">
                                  <Star className="w-3 h-3" />
                                  {creator.tier?.charAt(0).toUpperCase() + creator.tier?.slice(1)}
                                </div>
                              </div>
                            </div>
                          </div>

                          <p className="text-sm text-gray-300 mb-4 line-clamp-2">
                            {creator.bio || 'Talented creator on FlourishTalents'}
                          </p>

                          <div className="flex items-center gap-4 mb-6 text-sm text-gray-400">
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              <span>{creator.followers || 0} followers</span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleViewCreatorPortfolio(creator.id)}
                              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                              title="View portfolio"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {creator.followed ? (
                              <button
                                onClick={() => handleUnfollowCreator(creator.id)}
                                className="flex-1 py-2 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
                              >
                                <UserCheck className="w-4 h-4" />
                                Following
                              </button>
                            ) : (
                              <button
                                onClick={() => handleFollowCreator(creator)}
                                className="flex-1 py-2 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 group-hover:shadow-rose-500/50"
                              >
                                <UserPlus className="w-4 h-4" />
                                Follow
                              </button>
                            )}
                          </div>
                        </div>
                    ))
                  ) : creatorsLoaded ? (
                    <div className="col-span-full text-center py-12">
                      <p className="text-gray-400">No creators found matching your search.</p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* Members Grid */}
            {discoverSubTab === 'members' && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-6">Members</h2>
                {filteredMembers.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredMembers.map((member) => (
                      <div
                        key={member.id}
                        className="glass-effect rounded-2xl p-6 border border-white/10 hover:border-rose-400/50 transition-all group"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={member.avatar_url || 'https://via.placeholder.com/48'}
                              alt={member.name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                            <div>
                              <h3 className="text-lg font-bold text-white">{member.name}</h3>
                              <div className="flex items-center gap-1 text-xs text-blue-400">
                                <Users className="w-3 h-3" />
                                {member.tier?.charAt(0).toUpperCase() + member.tier?.slice(1)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <p className="text-sm text-gray-300 mb-4 line-clamp-2">
                          {member.bio || 'Member of FlourishTalents'}
                        </p>

                        <div className="flex items-center gap-4 mb-6 text-sm text-gray-400">
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            <span>{member.followers || 0} connections</span>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {/* Show notification badge only if YOU sent a request (waiting for response) */}
                          {member.requestStatus === 'sent' && (
                            <div className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-500/20 rounded-full text-xs text-yellow-300 font-medium">
                              <Clock className="w-3 h-3" />
                              Request Pending
                            </div>
                          )}

                          {/* Show notification badge if you RECEIVED a request */}
                          {member.requestStatus === 'received' && (
                            <div className="inline-flex items-center gap-1 px-3 py-1 bg-blue-500/20 rounded-full text-xs text-blue-300 font-medium">
                              <AlertCircle className="w-3 h-3" />
                              Connection Request
                            </div>
                          )}

                          <div className="flex gap-2">
                            {member.connected ? (
                              <>
                                <button
                                  onClick={() => {
                                    const conn = connections.find(c => c.id === member.id);
                                    if (conn) setSelectedConnection(conn);
                                    setActiveTab('messages');
                                  }}
                                  className="flex-1 py-2 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                  Message
                                </button>
                                <button
                                  onClick={() => handleDisconnectMember(member.id)}
                                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                  <UserMinus className="w-4 h-4" />
                                  Disconnect
                                </button>
                              </>
                            ) : member.requestStatus === 'received' ? (
                              <>
                                <button
                                  onClick={() => handleAcceptConnectionRequest(member.id)}
                                  className="flex-1 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
                                >
                                  <UserCheck className="w-4 h-4" />
                                  Accept
                                </button>
                                <button
                                  onClick={() => handleDeclineConnectionRequest(member.id)}
                                  className="flex-1 py-2 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors"
                                >
                                  Decline
                                </button>
                              </>
                            ) : member.requestStatus === 'sent' ? (
                              <button
                                onClick={() => handleCancelConnectionRequest(member.id)}
                                className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                              >
                                <Clock className="w-4 h-4" />
                                Cancel Request
                              </button>
                            ) : (
                              <button
                                onClick={() => handleConnectMember(member)}
                                className="w-full py-2 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 group-hover:shadow-rose-500/50"
                              >
                                <UserPlus className="w-4 h-4" />
                                Connect
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : membersLoaded ? (
                  <div className="col-span-full text-center py-12">
                    <p className="text-gray-400">No members found matching your search.</p>
                  </div>
                ) : null}
              </div>
            )}

            {/* Recommendations Grid */}
            {discoverSubTab === 'recommendations' && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                  <Zap className="w-6 h-6 text-yellow-400" />
                  Recommended For You
                </h2>
                {recommendations.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendations.map((rec) => (
                      <div
                        key={rec.id}
                        className="glass-effect rounded-2xl p-6 border border-white/10 hover:border-rose-400/50 transition-all"
                      >
                        <div className="flex items-start gap-3 mb-4">
                          <img
                            src={rec.avatar_url || 'https://via.placeholder.com/48'}
                            alt={rec.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-white">{rec.name}</h3>
                            <div className="flex items-center gap-1 text-xs text-yellow-400">
                              <Star className="w-3 h-3" />
                              {Math.round(rec.score * 100)}% Match
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-rose-300 bg-rose-500/10 px-3 py-1 rounded-full inline-block mb-3">
                          {rec.reason}
                        </p>

                        <p className="text-sm text-gray-300 mb-4">{rec.bio}</p>

                        <button className="w-full py-2 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2">
                          <UserPlus className="w-4 h-4" />
                          Connect
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="col-span-full text-center py-12 glass-effect rounded-2xl border border-white/10">
                    <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-400">No recommendations at the moment. Keep building your network!</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Network Tab */}
        {activeTab === 'network' && (
          <div className="space-y-8">
            {/* Following Creators */}
            <div>
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <Star className="w-6 h-6 text-yellow-400" />
                Following ({creators.filter(c => c.followed).length})
              </h2>

              {creators.filter(c => c.followed).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {creators.filter(c => c.followed).map((creator) => (
                    <div key={creator.id} className="glass-effect rounded-2xl p-6 border border-white/10 hover:border-rose-400/50 transition-all">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <img src={creator.avatar_url || 'https://via.placeholder.com/48'} alt={creator.name} className="w-12 h-12 rounded-full object-cover" />
                          <div>
                            <h3 className="text-lg font-bold text-white">{creator.name}</h3>
                            <div className="flex items-center gap-1 text-xs text-yellow-400">
                              <Star className="w-3 h-3" />
                              {creator.tier?.charAt(0).toUpperCase() + creator.tier?.slice(1)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-300 mb-4 line-clamp-2">{creator.bio || 'Talented creator'}</p>
                      <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {creator.followers || 0} followers
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleViewCreatorPortfolio(creator.id)} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2" title="View portfolio">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleUnfollowCreator(creator.id)} className="flex-1 py-2 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors flex items-center justify-center gap-2">
                          <UserCheck className="w-4 h-4" />
                          Unfollow
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 glass-effect rounded-2xl border border-white/10">
                  <p className="text-gray-400">You're not following any creators yet.</p>
                </div>
              )}
            </div>

            {/* Connected Members */}
            <div>
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <Users className="w-6 h-6 text-rose-400" />
                Connected Members ({connections.length})
              </h2>

              {connections.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {connections.map((connection) => (
                    <div
                      key={connection.id}
                      className="glass-effect rounded-2xl p-6 border border-white/10 hover:border-rose-400/50 transition-all"
                    >
                      <div className="flex items-start gap-4 mb-4">
                        <img
                          src={connection.avatar_url || 'https://via.placeholder.com/48'}
                          alt={connection.name}
                          className="w-16 h-16 rounded-full object-cover"
                        />
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white">{connection.name}</h3>
                          <p className="text-xs text-gray-400 capitalize">{connection.role}</p>
                          <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-rose-500/20 rounded text-xs text-rose-300 font-medium">
                            Connected
                          </div>
                        </div>
                      </div>

                      <p className="text-sm text-gray-300 mb-4">
                        {connection.bio || 'Member on FlourishTalents'}
                      </p>

                      <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>{connection.followers || 0} connections</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedConnection(connection);
                            setActiveTab('messages');
                          }}
                          className="flex-1 py-2 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Message
                        </button>
                        <button
                          onClick={() => handleDisconnectMember(connection.id)}
                          className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <UserMinus className="w-4 h-4" />
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 glass-effect rounded-2xl border border-white/10">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-400">You haven't connected with any members yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Groups Tab */}
        {activeTab === 'groups' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <FolderPlus className="w-6 h-6 text-rose-400" />
                Discover Groups
              </h2>
              <button className="px-4 py-2 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all">
                Create Group
              </button>
            </div>

            {groups.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="glass-effect rounded-2xl overflow-hidden border border-white/10 hover:border-rose-400/50 transition-all group cursor-pointer"
                  >
                    <div className="h-24 bg-gradient-to-r from-rose-500/20 to-purple-600/20 relative">
                      {group.avatar_url && (
                        <img
                          src={group.avatar_url}
                          alt={group.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="p-6">
                      <h3 className="text-lg font-bold text-white mb-2">{group.name}</h3>
                      <p className="text-sm text-gray-300 mb-4 line-clamp-2">{group.description}</p>
                      
                      <div className="flex items-center justify-between mb-4 text-sm text-gray-400">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {group.member_count} members
                        </div>
                        <span className="text-xs px-2 py-1 bg-rose-500/20 text-rose-300 rounded-full capitalize">
                          {group.category}
                        </span>
                      </div>

                      <button className="w-full py-2 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors">
                        Join Group
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 glass-effect rounded-2xl border border-white/10">
                <FolderPlus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-400">No groups available at the moment.</p>
              </div>
            )}
          </div>
        )}

        {/* Teams Tab */}
        {activeTab === 'teams' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Briefcase className="w-6 h-6 text-rose-400" />
                Professional Teams
              </h2>
              <button className="px-4 py-2 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all">
                Create Team
              </button>
            </div>

            {teams.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="glass-effect rounded-2xl p-6 border border-white/10 hover:border-rose-400/50 transition-all"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-rose-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-8 h-8 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-white">{team.name}</h3>
                          {team.verified && (
                            <CheckCircle className="w-5 h-5 text-blue-400" />
                          )}
                        </div>
                        {team.industry && (
                          <p className="text-xs text-gray-400">{team.industry}</p>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-gray-300 mb-4">{team.description}</p>

                    <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {team.member_count} members
                      </div>
                    </div>

                    <button className="w-full py-2 bg-gradient-to-r from-rose-500 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all">
                      View Team
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 glass-effect rounded-2xl border border-white/10">
                <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-400">No teams available at the moment.</p>
              </div>
            )}
          </div>
        )}

        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <h3 className="text-lg font-bold text-white mb-4">Recent Messages</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {messages.length > 0 ? (
                  messages.slice(0, 10).map((msg) => (
                    <button
                      key={msg.id}
                      onClick={() => {
                        const connection = connections.find((c) => c.id === msg.sender_id);
                        if (connection) setSelectedConnection(connection);
                      }}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedConnection?.id === msg.sender_id
                          ? 'bg-rose-500/20 border border-rose-400/50'
                          : 'bg-white/5 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={msg.sender_avatar || 'https://via.placeholder.com/32'}
                          alt={msg.sender_name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{msg.sender_name}</p>
                          <p className="text-xs text-gray-400 truncate">{msg.content}</p>
                        </div>
                        {!msg.read && (
                          <div className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No messages yet</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2">
              {selectedConnection ? (
                <div className="glass-effect rounded-2xl border border-white/10 p-6 h-96 flex flex-col">
                  <div className="flex items-center gap-3 pb-4 border-b border-white/10 mb-4">
                    <img
                      src={selectedConnection.avatar_url || 'https://via.placeholder.com/40'}
                      alt={selectedConnection.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1">
                      <h4 className="font-bold text-white">{selectedConnection.name}</h4>
                      <p className="text-xs text-gray-400">Online</p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto mb-4 space-y-3">
                    {messages
                      .filter((m) => m.sender_id === selectedConnection.id)
                      .map((msg) => (
                        <div key={msg.id} className="flex gap-2">
                          <img
                            src={msg.sender_avatar}
                            alt={msg.sender_name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                          <div className="bg-white/10 rounded-lg p-3 max-w-xs">
                            <p className="text-sm text-white">{msg.content}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type a message..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-rose-400"
                    />
                    <button
                      onClick={handleSendMessage}
                      className="p-2 bg-gradient-to-r from-rose-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="glass-effect rounded-2xl border border-white/10 p-8 h-96 flex flex-col items-center justify-center">
                  <MessageSquare className="w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-gray-400 text-center">Select a connection to start messaging</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Portfolio Modal */}
      {portfolioModalOpen && portfolioData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-gray-900 rounded-2xl border border-white/10 w-full max-w-2xl max-h-96 overflow-y-auto shadow-2xl flex flex-col">
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-white/10 bg-gray-900/95 backdrop-blur-sm">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {portfolioData.profile.avatar_url && (
                  <img
                    src={portfolioData.profile.avatar_url}
                    alt={portfolioData.profile.full_name}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-white truncate">{portfolioData.profile.full_name}</h2>
                  <p className="text-sm text-gray-400 truncate">{portfolioData.profile.bio}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <button
                  onClick={() => {
                    setPortfolioModalOpen(false);
                    navigate(`/portfolio/${portfolioCreatorId}`, {
                      state: { portfolio: portfolioData }
                    });
                    setPortfolioData(null);
                  }}
                  className="px-3 py-1.5 text-sm bg-gradient-to-r from-rose-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all font-medium"
                >
                  View Full
                </button>
                <button
                  onClick={() => {
                    setPortfolioModalOpen(false);
                    setPortfolioData(null);
                  }}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-8">
              {/* About */}
              {portfolioData.profile.about && (
                <div>
                  <h3 className="text-lg font-bold text-white mb-3">About</h3>
                  <p className="text-gray-300 leading-relaxed">{portfolioData.profile.about}</p>
                </div>
              )}

              {/* Projects */}
              {portfolioData.projects.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">Projects</h3>
                  <div className="space-y-4">
                    {portfolioData.projects.map((project: any) => (
                      <div key={project.id} className="glass-effect rounded-lg p-4 border border-white/10">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-white">{project.title}</h4>
                          {project.demo_url && (
                            <a
                              href={project.demo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-rose-400 hover:text-rose-300 text-sm"
                            >
                              View →
                            </a>
                          )}
                        </div>
                        {project.description && (
                          <p className="text-sm text-gray-300 mb-3">{project.description}</p>
                        )}
                        {project.technologies && (
                          <div className="flex flex-wrap gap-2">
                            {project.technologies.split(',').map((tech: string, idx: number) => (
                              <span key={idx} className="text-xs bg-rose-500/20 text-rose-300 px-2 py-1 rounded">
                                {tech.trim()}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills */}
              {portfolioData.skills.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {portfolioData.skills.map((skill: any, idx: number) => (
                      <span
                        key={skill.id || idx}
                        className="px-3 py-1 bg-gradient-to-r from-rose-500/20 to-purple-600/20 text-gray-200 rounded-full text-sm border border-white/10"
                      >
                        {skill.skill_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {portfolioData.projects.length === 0 && portfolioData.skills.length === 0 && !portfolioData.profile.about && (
                <div className="text-center py-8">
                  <FolderPlus className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-50" />
                  <p className="text-gray-400">This portfolio is still being built</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 space-y-3 z-40">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-6 py-4 rounded-lg backdrop-blur-md border shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-500/20 border-green-400/50 text-green-100'
                : 'bg-red-500/20 border-red-400/50 text-red-100'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
