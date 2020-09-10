'use strict';
const trim = require("trim");
const adapter=require('webrtc-adapter');
const socketClient=require("socket.io-client");
const hark = require('hark');
const CATTLE_CALL_SERVER_URL="https://cattlecall.azurewebsites.net";
//const CATTLE_CALL_SERVER_URL="http://192.168.225.21:8080";
let Emitter = require("events").EventEmitter;
let $this;
let speechEvents={};
const cattleCallaxios = require("axios");
cattleCallaxios.defaults.baseURL = CATTLE_CALL_SERVER_URL, cattleCallaxios.defaults.headers.post["Content-Type"] = "application/json";
let rtcPeerConn={};
class CattleCall extends Emitter{
    constructor(clientId, clientSecret) {
        super();
        if(clientId==="" || clientSecret==="" || clientId===0||clientSecret===0){
            throw Error("Invalid credentials!");
        }
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.socket="",
        this.userId=0;
        this.localVideoStream=null;
        this.localScreenStream=null;
        this.active_meeting_id=0;
        this.audioStatus=true,
        this.videoStatus=true,
        this.localVideoSelector="";
        this.audioSource="default";
        this.videoSource="default";
        this.configurationConferenceVideocall=null;
        this.doNegotication=true;
        this.connectionState="pending";
        this.screenScharetrackId=null;
        this.incomingScreenShare=null;
        //this.rtcPeerConn={};
        //this.connectionStatus="not-connected";
        $this = this;
    }
    addUser(data){
        return new Promise((resolve,reject)=>{
            registerUser(data).then(response=>{
                resolve(response);
            }).catch(error=>{
                reject(error);
            });
        })
    }
    scheduleMeeting(meeting_id,password,user_id){
        return new Promise((resolve,reject)=>{
            createMeeting(meeting_id,password,user_id).then(response=>{
                resolve(response);
            }).catch(error=>{
                reject(error);
            });
        })
    }
    startMeeting(meeting_id,password){
        return new Promise(async(resolve,reject)=>{
            if($this.connectionState!=="connected") return reject("invalid request, connection missing");
            if(meeting_id=="" || meeting_id===undefined){
                return reject("meeting id requered")
            }
            if(password=="" || password===undefined){
                return reject("password requered")
            }
            let data={meeting_id:meeting_id,password:password};
            $this.socket.emit("start_meeting",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    isMeetingStarted(meeting_id,password){
        return new Promise(async(resolve,reject)=>{
            if($this.connectionState!=="connected") return reject("invalid request, connection missing");
            if(meeting_id=="" || meeting_id===undefined){
                return reject("meeting id requered")
            }
            if(password=="" || password===undefined){
                return reject("password requered")
            }
            let data={meeting_id:meeting_id,password:password};
            $this.socket.emit("is_meeting_started",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    connect(user_id){
       $this.socket=this.socket=socketClient.connect(CATTLE_CALL_SERVER_URL, {query: "client_id="+this.clientId+"&clientSecret="+this.clientSecret+"&user_id="+user_id+"&platform=1"});
       //$this.socket=this.socket,
       this.socket.on("connect", function () {
        this.userId = user_id;
        $this.userId = user_id;
        $this.videoLoginUserId=user_id;
        //getServers();
        listenSockets();
        $this.connectionState="connected";
       })
    }
    logout(){
        return new Promise((resolve,reject)=>{
            let data={user_id:$this.videoLoginUserId};
            $this.socket.emit("logout",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    createMeating(meeting_id,password){
        return new Promise(async(resolve,reject)=>{
            if($this.connectionState!=="connected") return reject("invalid request, connection missing");
            if(meeting_id=="" || meeting_id===undefined){
                return reject("meeting id requered")
            }
            if(password=="" || password===undefined){
                return reject("password requered")
            }
            let data={meeting_id:meeting_id,password:password};
            $this.socket.emit("create_meeting",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    joinMeeting(meeting_id,password,localVideElement,audioStatus,videoStatus,audioSource,videoSource){
        if(typeof audioStatus!="undefined"){
            $this.audioStatus=audioStatus;
        }
        if(typeof videoStatus!="undefined"){
            $this.videoStatus=videoStatus;
        }
        if(typeof audioSource!="undefined"){
            $this.audioSource=audioSource;
        }
        if(typeof videoSource!="undefined"){
            $this.videoSource=videoSource;
        }
        $this.localVideoSelector=document.querySelector(localVideElement);
        return new Promise(async(resolve,reject)=>{
            if($this.connectionState!=="connected") return reject("invalid request, connection missing");
            if(meeting_id=="" || meeting_id===undefined){
                reject("meeting id requered")
            }
            let data={meeting_id:meeting_id,password:password};
            $this.socket.emit("is_meeting_started",data,function(response){
                if(!response.success && response.type===1){
                    resolve(response);
                }
            })
            $this.socket.emit("join_meeting",data,async function(response){
                if(response.success){
                    resolve(response);
                    $this.active_meeting_id=meeting_id;
                    let participents=response.data;
                    addStream(async function(){
                        await participents.forEach(items=>{
                            initVideoConferenceWebRtc(items.user_id,items.user_id,true)
                        });
                    });
                }
                reject(response);
            })
        });
    }
    toggleVideo(){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        $this.videoStatus=$this.videoStatus?false:true;
        if (!$this.localVideoStream) return;
        for (let track of $this.localVideoStream.getVideoTracks() ){
            track.enabled = !track.enabled ;
        }
        //updateConfrenceSteam("video");
        let data={"status":$this.videoStatus,'participant_id' : $this.videoLoginUserId,"meeting_id":$this.active_meeting_id};
        $this.socket.emit("video_change",data);
    }
    toggleAudio(){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        $this.audioStatus=$this.audioStatus?false:true;
        if (!$this.localVideoStream) return;
        for (let track of $this.localVideoStream.getAudioTracks() ){
            track.enabled = !track.enabled ;
        }
        //updateConfrenceSteam("audio");
        let data={"status":$this.audioStatus,'participant_id' : $this.videoLoginUserId,"meeting_id":$this.active_meeting_id};
        $this.socket.emit("audio_change",data);
    }
    changeVideoSource(id){
        if(!id)return $this.emit("error","invalid source");
        $this.videoSource=id;
        addStream(function(){
            updateConfrenceSteam("video");
        })
    }
    changeAudioSource(id){
        if(!id)return $this.emit("error","invalid source");
        $this.videoSource=id;
        addStream(function(){
            updateConfrenceSteam("audio");
        })
    }
    muteParticipant(participentId){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        if(!participentId){return $this.emit("error","participant id required");} 
        let data={status:false,participant_id : participentId,meeting_id:$this.active_meeting_id};
        $this.socket.emit("mute_participant_audio",data); 
    }
    unmuteParticipant(participentId){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        if(!participentId){return $this.emit("error","participant id required");} 
        let data={"status":true,'participant_id' : participentId,meeting_id:$this.active_meeting_id};
        $this.socket.emit("unmute_participant_audio",data); 
    }
    turnOffVideo(participentId){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        if(!participentId){return $this.emit("error","participant id required");} 
        let data={"status":false,'participant_id' : participentId,meeting_id:$this.active_meeting_id};
        $this.socket.emit("off_participant_video",data); 
    }
    turnOnVideo(participentId){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        if(!participentId){return $this.emit("error","participant id required");} 
        let data={"status":true,'participant_id' : participentId,meeting_id:$this.active_meeting_id};
        $this.socket.emit("on_participant_video",data); 
    }
    removeParticipant(participentId){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        if(!participentId){return $this.emit("error","participant id required");} 
        let data={'participant_id' : participentId,meeting_id:$this.active_meeting_id};
        $this.socket.emit("remove_participant",data); 
    }
    spotlightUser(participentId){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        if(!participentId){return $this.emit("error","participant id required");} 
        let data={'participant_id' : participentId,meeting_id:$this.active_meeting_id};
        $this.socket.emit("spotlight_user",data);
    }
    makeHost(participentId){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        if(!participentId){return $this.emit("error","participant id required");} 
        let data={'participant_id' : participentId,meeting_id:$this.active_meeting_id};
        $this.socket.emit("chnage_host",data);
    }
    leaveMeeting(){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        let data={'participant_id' : $this.videoLoginUserId,meeting_id:$this.active_meeting_id};
        $this.socket.emit("leave_meeting",data); 
    }
    endMeeting(){
        if($this.connectionState!=="connected") return $this.emit("error","invalid request, connection missing");
        let data={meeting_id:$this.active_meeting_id};
        $this.socket.emit("end_meeting",data); 
        endConference()
    }
    shareScreen(){
        getMediaStream(function(){
            let data={meeting_id:$this.active_meeting_id,track_id:$this.screenScharetrackId,participant_id:$this.videoLoginUserId};
            $this.socket.emit("screen_share_track",data);
            addScreenShareStreem();
        })
    }

   /** getDevices is used to get audio / video devices **/

    getDevices(callback) {
        navigator.mediaDevices.getUserMedia({audio:true})
        .then(function() {
           console.log("audio working");
        }).catch(function(err) { 
            if(err.name==="NotFoundError"){
                $this.audioStatus=false;
            }
         });
        navigator.mediaDevices.getUserMedia({video:true})
        .then(function() {
           console.log("video working");
        }).catch(function(err) {  
            if(err.name==="NotFoundError"){
                $this.videoStatus=false;
            } 
        });
        var videoInputs = [];
        var audioInputs = [];
        navigator.mediaDevices.enumerateDevices().then(function(deviceInfos){
            for (var i = 0; i !== deviceInfos.length; ++i) {
                var deviceInfo = deviceInfos[i];
                if (deviceInfo.kind === "videoinput") {
                    videoInputs.push(deviceInfo);
                }else if(deviceInfo.kind == "audioinput"){
                    audioInputs.push(deviceInfo);
                }
            }
            return callback(null,{audio : audioInputs,video : videoInputs});
        }).catch(function(err){
            return callback(err);
        });
    }
   
}
function listenSockets(){
    $this.socket.on("configuration",function(data){
        $this.configurationConferenceVideocall=data;
        let emitData={user_id:$this.userId};
        $this.emit("ready",emitData);
    });
    $this.socket.on("video_conference_signal",function(data){
        switch(data.type) {
            case "offer":
                onVideoConferenceOffer(data.offer,data.from,data.from);
                break;
            case "answer":
                onVideoConferenceAnswer(data.answer,data.from,data.from);
                break;
            case "candidate":
                onVideoConferenceCandidate(data.candidate,data.from,data.from);
                break;
            default:
                break;
        }
    });
    $this.socket.on("new_user_joined",function(data){
        if(data.user_id!=$this.videoLoginUserId){
            $this.emit('user_joined',data)   
        }
    });
    $this.socket.on("mute_participant_audio",function(data){
        if(data.participant_id==$this.videoLoginUserId && data.meeting_id==$this.active_meeting_id){
            if (!$this.localVideoStream) return;
            for (let track of $this.localVideoStream.getAudioTracks() ){
                track.enabled = false ;
            }
            let data={"status":false,'participant_id' : $this.videoLoginUserId,"meeting_id":$this.active_meeting_id};
            $this.socket.emit("audio_change",data);
        }
    })
    $this.socket.on("unmute_participant_audio",function(data){
        if(data.participant_id==$this.videoLoginUserId && data.meeting_id==$this.active_meeting_id){
            if (!$this.localVideoStream) return;
            for (let track of $this.localVideoStream.getAudioTracks() ){
                track.enabled = true;
            }
            let data={"status":true,'participant_id' : $this.videoLoginUserId,"meeting_id":$this.active_meeting_id};
            $this.socket.emit("audio_change",data);
        }
    })
    $this.socket.on("off_participant_video",function(data){
        if(data.participant_id==$this.videoLoginUserId && data.meeting_id==$this.active_meeting_id){
            if (!$this.localVideoStream) return;
            for (let track of $this.localVideoStream.getVideoTracks() ){
                track.enabled = false ;
            }
            let data={"status":false,'participant_id' : $this.videoLoginUserId,"meeting_id":$this.active_meeting_id};
            $this.socket.emit("video_change",data);
        }
    })
    $this.socket.on("on_participant_video",function(data){
        if(data.participant_id==$this.videoLoginUserId && data.meeting_id==$this.active_meeting_id){
            if (!$this.localVideoStream) return;
            for (let track of $this.localVideoStream.getVideoTracks() ){
                track.enabled = true;
            }
            let data={"status":true,'participant_id' : $this.videoLoginUserId,"meeting_id":$this.active_meeting_id};
            $this.socket.emit("video_change",data);
        }
    })
    $this.socket.on('audio_change',function(data){
        $this.emit('audio_change',data);
    })
    $this.socket.on("video_change",function(data){
        $this.emit('video_change',data);
    });
    $this.socket.on('meeting_started',function(data){
        $this.emit('meeting_started',data);
    })
    $this.socket.on('leave_meeting',function(data){
        $this.emit('user_left',data);
        removeParticipant(data.participant_id);
    })
    $this.socket.on('spotlight_user',function(data){
        $this.emit('spotlight_user',data);
    })
    $this.socket.on('chnage_host',function(data){
        $this.emit('chnage_host',data);
    })
    $this.socket.on('end_meeting',function(data){
        $this.emit("meeting_end",data);
        endConference();
    }) 
    $this.socket.on('cattle_call_error', (error) => {
        $this.emit("error",error);
    });
    $this.socket.on('error', (error) => {
       $this.emit("error",error);
    });
    $this.socket.on('user_disconnected',data=>{
        $this.emit('user_left',data);
        removeParticipant(data.participant_id);
    })
    $this.socket.on('participant_removed',data=>{
        $this.emit("user_left",data);
        if(data.participant_id==$this.user_id){
            endConference();
        }else{
            removeParticipant(data.participant_id);
        }
    })
    $this.socket.on("screen_share_track",data=>{
        console.log(data,"screen share")
        $this.incomingScreenShare=data.track_id;
    })
}
function registerUser(data){
    return new Promise(async (resolve,rejects)=>{
        if(data.name===undefined || data.name==""){
            rejects({success:false,message:"name required"})
        }
        data.clientId=$this.clientId;
        data.client_secret=$this.clientSecret;
        await cattleCallaxios.post("/api/v1/add-user",{data:data}).then(response=>{
            if(response.data.success){
                resolve(response.data);
            }else{
                rejects(response.data);
            }
        }).catch(error=>{
            rejects({success:false,message:error.message});
        })
    })
}
function createMeeting(meeting_id,password,user_id){
    return new Promise(async (resolve,rejects)=>{
        if(user_id=="" || user_id===undefined){
            return reject("user id requered")
        }
        if(meeting_id=="" || meeting_id===undefined){
            return reject("meeting id requered")
        }
        if(password=="" || password===undefined){
            return reject("password requered")
        }
        if(!$this.clientId || !$this.clientSecret){
            return reject("invalid request")
        }
        await cattleCallaxios.post("/api/v1/create-meeting",{user_id:user_id,meeting_id:meeting_id,password:password,clientId:$this.clientId,client_secret:$this.clientSecret}).then(response=>{
            if(response.data.success){
                resolve(response.data);
            }else{
                rejects(response.data);
            }
        }).catch(error=>{
            rejects({success:false,message:error.message});
        })
    })
}

function getServers(){
    let data={};
    $this.socket.emit('configuration',data,function(data){
        $this.configurationConferenceVideocall=data;
    })
}

async function initVideoConferenceWebRtc(id,toId,negotiate){
    if(rtcPeerConn[id]) return false;
    rtcPeerConn[id] = new RTCPeerConnection($this.configurationConferenceVideocall);
    rtcPeerConn[id].onicecandidate = function (evt) {
        if (evt.candidate && $this.videoLoginUserId!=toId){
            $this.socket.emit('video_conference_signal',{type:"candidate", candidate: evt.candidate,from :$this.videoLoginUserId,to : toId,meeting_id : $this.active_meeting_id});
        }
    };
    rtcPeerConn[id].onnegotiationneeded = function () {
        if(rtcPeerConn[id].signalingState != "stable"){
            return;
        }
        if(typeof rtcPeerConn[id]._do_negotiate === "undefined") rtcPeerConn[id]._do_negotiate = true;
        if(!rtcPeerConn[id]._do_negotiate){
            rtcPeerConn[id]._do_negotiate = true;
            return;
        }
        if(rtcPeerConn[id]._negotiating === true){
            return;
        }else{
            rtcPeerConn[id]._negotiating = true;
        }
        rtcPeerConn[id].createOffer().then((desc)=>{
            desc.sdp = handleOfferSdp(desc);
            if(rtcPeerConn[id].signalingState != "stable"){
                rtcPeerConn[id]._negotiating = false;
                return;
            }
            rtcPeerConn[id].setLocalDescription(desc).then(()=> {
                if($this.videoLoginUserId!=toId){
                $this.socket.emit('video_conference_signal',{type:"offer", offer: rtcPeerConn[id].localDescription,from : $this.videoLoginUserId,to : toId,meeting_id : $this.active_meeting_id});
                rtcPeerConn[id]._negotiating = false;
                }
            }).catch(error=>{
                console.log("setLocalDescription error",error);
                rtcPeerConn[id]._negotiating = false;
            });
        }).catch(e=>{
            rtcPeerConn[id]._negotiating = false;
        });
    };
    rtcPeerConn[id].onremovetrack=function(){
        console.log("track removed");
    };
    rtcPeerConn[id].onopen = function () {
        console.log("Connected");
    };
    rtcPeerConn[id].onerror = function (err) {
        console.log("Got error", err);
    };
    rtcPeerConn[id].oniceconnectionstatechange = function() {
        try{
            if(rtcPeerConn[id].iceConnectionState == 'failed') {
                if (rtcPeerConn[id].restartIce) {
                    rtcPeerConn[id].restartIce();
                  } else {
                    const offerOptions = {offerToReceiveAudio: 1,offerToReceiveVideo: 1,iceRestart:true};
                      rtcPeerConn[id].createOffer(offerOptions).then((desc)=>{
                        desc.sdp = handleOfferSdp(desc);
                        rtcPeerConn[id].setLocalDescription(desc).then(()=> {
                            console.log(id,"-----failed connection id----------",toId);
                            $this.socket.emit('video_conference_signal',{type:"offer", offer: rtcPeerConn[id].localDescription,from : videoLoginUserId,to : toId,meeting_id : meeting_id});
                        }).catch(error=>{
                            console.log("setLocalDescription error",error)
                        });
                    }).catch(err=>{
                        console.log("offer error",err)
                    });
                  }
            }else if(rtcPeerConn[id].iceConnectionState == 'connected'){
                console.log("connected-----------",id);
            }else if(rtcPeerConn[id].iceConnectionState == 'closed'){
               console.log("closed----------",id);
               $this.emit("disconnect",id);
            }else if(rtcPeerConn[id].iceConnectionState == 'disconnected'){
                console.log("disconnected------",id);
                $this.emit("disconnect",id);
            }else if(rtcPeerConn[id].iceConnectionState == 'new'){
                console.log("new-----------")
            }
        }catch (e){

        }
    };
    rtcPeerConn[id].ontrack = function (evt) {
        if($this.incomingScreenShare){
            evt.streams[0].getTracks().forEach(track=>{
                if(track.id== $this.incomingScreenShare){
                    return setScreenshareVideo(evt.streams[0],id);
                }
            });
            return false;
        }
        setConferenceVideo(evt.streams[0],id);
    };
    if($this.localVideoStream){
        addConferenceStream(id);
    }else{
        addStream(function(){
            addConferenceStream(id);
        })
    }
}

function setConferenceVideo(stream,id){
    let options={}
        speechEvents[id] = hark(stream, options);
        speechEvents[id].on('speaking', function(data) {
            $this.emit("speaking",id);
        });
        speechEvents[id].on('stopped_speaking', function(data) {
            $this.emit("stopped_speaking",id);
        });
    $this.emit("user_stream_added",stream,id);
}

function addConferenceStream(id){
    if(typeof rtcPeerConn[id] != "undefined"){
        $this.localVideoStream.getTracks().forEach(track => rtcPeerConn[id].addTrack(track, $this.localVideoStream));
    }
}
function addScreenShareStreem(){
    for(let connection in rtcPeerConn ){
        $this.localScreenStream.getTracks().forEach(track => {
            rtcPeerConn[connection].addTrack(track,$this.localScreenStream)
        });
    }
}
function setScreenshareVideo(stream,id){
    $this.emit("screen_stream_added",stream,id);
}
function updateConfrenceSteam(type){
    for(let connection in rtcPeerConn ){
        rtcPeerConn[connection].getSenders().map(function(sender) {
            sender.replaceTrack($this.localVideoStream.getTracks().find(function(track) {
                return track.kind === sender.track.kind;
            }));
        });
    }
}

function removeConferenceStream(id){
    if(typeof rtcPeerConn[id] != "undefined"){
        rtcPeerConn[id].removeStream($this.localVideoStream);
    }
}
function removeParticipant(id){
    if(typeof rtcPeerConn[id] != "undefined" && rtcPeerConn[id] != null){
        let track=$this.localVideoStream.getTracks()[0];
        var sender = rtcPeerConn[id].getSenders().find(function(s) {
            return s.track.kind == track.kind;
          });
        rtcPeerConn[id].removeTrack(sender);
        rtcPeerConn[id].close();
        rtcPeerConn[id]=null;
    }
}
function endConference(){
    for(let key in rtcPeerConn){
        if(rtcPeerConn[key]){
            rtcPeerConn[key].close();
            rtcPeerConn[key].onicecandidate = null;
            rtcPeerConn[key].ontrack = null;
            rtcPeerConn[key]=null;
        }
    }
    if($this.localVideoStream)$this.localVideoStream.stop();
    $this.localVideoStream=null;
}

function onVideoConferenceOffer(offer,id,toId) {
    console.log("offer step 1","test log");
    if(!rtcPeerConn[id]){
        initVideoConferenceWebRtc(id,toId,true);
        return;
    }else if(typeof rtcPeerConn[id] !== "undefined"){
        console.log("localoffer")
    } 
    rtcPeerConn[id].setRemoteDescription(new RTCSessionDescription(offer)).then(()=>{
        rtcPeerConn[id].createAnswer().then(function(answer){
            rtcPeerConn[id].setLocalDescription(answer).catch(error=>{
                console.log(error);
            });
            $this.socket.emit('video_conference_signal',{type:"answer", answer: answer,from :$this.videoLoginUserId,to : toId,meeting_id : $this.active_meeting_id});
        }).catch(error=>{
            console.log(error,"error while creating answer");
        })
    }).catch(err=>{
        console.log(err,"error seting remote description");
    })
}


function onVideoConferenceAnswer(answer,id,toId) {
    if(!rtcPeerConn[id]){
        initVideoConferenceWebRtc(id,toId,false);
        return;
    }
    if(rtcPeerConn[id].signalingState === "have-local-offer"){
        rtcPeerConn[id].setRemoteDescription(new RTCSessionDescription(answer));
    }else if(rtcPeerConn[id].signalingState === "stable"){
        setTimeout(function(){
            initVideoConferenceWebRtc(id,toId,false);
        },500);
    }
}

function onVideoConferenceCandidate(candidate,id,toId) {
    if(!rtcPeerConn[id]){
        initVideoConferenceWebRtc(id,toId,false);
        return;
    }
    setTimeout(function(){
        rtcPeerConn[id].addIceCandidate(new RTCIceCandidate(candidate)).catch(error=>{
            console.log(error,"addIceCandidate")
        });
    },1000)   
}

/** addStream is used to set local stream to peer connection **/

function addStream(callback,streamtype=""){
    // get a local stream, show it in our video tag and add it to be sent
    if($this.localVideoStream != null){
        $this.localVideoStream.stop();
    }
    let videoConstraints={deviceId:"default"};
    let echoCancellation=false;
    let noiseSuppression=false;
    if (navigator.mediaDevices.getSupportedConstraints().echoCancellation){
        echoCancellation=true;
    }
    if (navigator.mediaDevices.getSupportedConstraints().noiseSuppression){
        noiseSuppression=true;
    }
    if (navigator.mediaDevices.getSupportedConstraints().height) {
        videoConstraints.height= { min: 180, ideal: 480, max:720 };
    }
    if (navigator.mediaDevices.getSupportedConstraints().width) {
        videoConstraints.width= { min: 320, ideal: 640, max: 1280 };
    }
    if (navigator.mediaDevices.getSupportedConstraints().aspectRatio){
        videoConstraints.aspectRatio="1.7777777778";
    }
    if (navigator.mediaDevices.getSupportedConstraints().frameRate){
        videoConstraints.frameRate={max:30};
    }
    if($this.videoSource){
        videoConstraints.deviceId=$this.videoSource;
    }   
    const constraints = {
        audio: $this.audioStatus?{deviceId: $this.audioSource ? $this.audioSource : "default",echoCancellation:echoCancellation,noiseSuppression:noiseSuppression}:$this.audioStatus,
        video: $this.videoStatus?videoConstraints:$this.videoStatus
      };
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        $this.localVideoStream = stream;
        $this.localVideoStream.stop = function () {
            this.getAudioTracks().forEach(function (track) {
                track.stop();
            });
            this.getVideoTracks().forEach(function (track) { //in case... :)
                track.stop();
            });
        };
        $this.localVideoSelector.srcObject =$this.localVideoStream;
        $this.localVideoSelector.muted = true;
         if(callback){
            callback(stream);
         }
      }).catch(err=>{
        //alert("Camera device is not readable");
        $this.emit("error",err);
        console.log("media err",err);
      });
}
function getMediaStream(callback){
    // get a local stream, show it in our video tag and add it to be sent    
    const constraints = {};
    navigator.mediaDevices.getDisplayMedia(constraints).then(stream => {
        $this.localScreenStream = stream;
        stream.getTracks().forEach(track => $this.screenScharetrackId=track.id);
         if(callback){
            callback(stream);
         }
      }).catch(err=>{
        //alert("Camera device is not readable");
        $this.emit("error",err);
        console.log("screen media err",err);
      });
}
function handleOfferSdp(offer) {
    let sdp = offer.sdp.split('\r\n');//convert to an concatenable array
    let new_sdp = '';
    let position = null;
    sdp = sdp.slice(0, -1); //remove the last comma ','
    for(let i = 0; i < sdp.length; i++) {//look if exists already a b=AS:XXX line
        if(sdp[i].match(/b=AS:/)) {
            position = i; //mark the position
        }
    }
    if(position) {
        sdp.splice(position, 1);//remove if exists
    }
    for(let i = 0; i < sdp.length; i++) {
        if(sdp[i].match(/m=video/)) {//modify and add the new lines for video
            new_sdp += sdp[i] + '\r\n' + 'b=AS:' + '128' + '\r\n';
        }
        else {
            if(sdp[i].match(/m=audio/)) { //modify and add the new lines for audio
                new_sdp += sdp[i] + '\r\n' + 'b=AS:' + 64 + '\r\n';
            }
            else {
                new_sdp += sdp[i] + '\r\n';
            }
        }
    }
    return new_sdp; //return the new sdp
}
module.exports = CattleCall;
global.CattleCall = CattleCall;
window.CattleCall=CattleCall;