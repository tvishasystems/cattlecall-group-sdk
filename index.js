'use strict';
const trim = require("trim");
const fs = require("fs");
const path = require("path");
const socketClient=require("socket.io-client");
const adapter=require('webrtc-adapter');
const { rootCertificates } = require("tls");
const SOKET_SERVER_URL="https://cattlecall.azurewebsites.net";
//const SOKET_SERVER_URL="http://192.168.0.10:8080";
var rtcPeerConn={};
var videoLoginUserId = 0;
var videoCallUserIds = [];
let active_meeting_id=0;
let maxDuration=0;
var localVideoStream = null;
var remoteVideoStream = null;
var ROOM = "";
var socket = null;
let localVideoSelector;
let remoteVideoSelector;
let isIncomingCall=false;
let callData;
let isCaller=false;
let audioStatus=true;
let videoStatus=true;
let __this;
let audioSource = "default";
let videoSource = "default";
let configurationConferenceVideocall =null;
let doNegotication=true;
class CattleCall {
    constructor(user_id,clientId, clientSecret) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.socket=null;
        this.userId=user_id;
        this.ready=false;
        this.incommingcall;
        socket=socketClient.connect(SOKET_SERVER_URL, {query: "client_id="+this.clientId+"&clientSecret="+this.clientSecret+"&user_id="+user_id+"&platform=1"});
        socket.on('connect',()=>{
           getServers();
           this.listenSockets();
        });
        
        __this=this;
        videoLoginUserId=user_id;
    }
    addUser(data){
        return new Promise(async(resolve,reject)=>{
            if(data.name=="" || data.name===undefined || data.name.length<3){
                reject("inavlid user name")
            }
            socket.emit("add_user",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    login(){
        return new Promise((resolve,reject)=>{
            let data={user_id:videoLoginUserId};
            socket.emit("login",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    logout(){
        return new Promise((resolve,reject)=>{
            let data={user_id:videoLoginUserId};
            socket.emit("logout",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    createMeating(meeting_id,password){
        return new Promise(async(resolve,reject)=>{
            if(meeting_id=="" || meeting_id===undefined){
                 reject("meeting id requered")
            }
            if(password=="" || password===undefined){
                 reject("password requered")
            }
            let data={meeting_id:meeting_id,password:password};
            socket.emit("create_meeting",data,function(response){
                if(response.success){
                    resolve(response);
                }
                reject(response);
            })
        });
    }
    joinMeeting(meeting_id,password,localVideElement,audioStatus,videoStatus,audioSource,videoSource){
        if(typeof audioStatus!="undefined"){
            audioStatus=audioStatus;
        }
        if(typeof videoStatus!="undefined"){
            videoStatus=videoStatus;
        }
        if(typeof audioSource!="undefined"){
            audioSource=audioSource;
        }
        if(typeof videoSource!="undefined"){
            videoSource=videoSource;
        }
        localVideoSelector=document.querySelector(localVideElement);
        return new Promise(async(resolve,reject)=>{
            if(meeting_id=="" || meeting_id===undefined){
                reject("meeting id requered")
            }
            let data={meeting_id:meeting_id,password:password};
            socket.emit("join_meeting",data,function(response){
                if(response.success){
                    resolve(response);
                    active_meeting_id=meeting_id;
                    let participents=response.data;
                    participents.forEach(items=>{
                        if(items.user_id!=videoLoginUserId){
                            initVideoConferenceWebRtc(items.user_id,items.user_id,true)
                        }
                    });
                    addStream();
                }
                reject(response);
            })
        });
    }
    toggleVideo(){
        videoStatus=videoStatus?false:true;
        if (!localVideoStream) return;
        for (let track of localVideoStream.getVideoTracks() ){
            track.enabled = !track.enabled ;
        }
        let data={"status":videoStatus,'share_user_id' : active_meeting_id};
        socket.emit("video_toogle",data);
    }
    toggleAudio(){
        audioStatus=audioStatus?false:true;
        if (!localVideoStream) return;
        for (let track of localVideoStream.getAudioTracks() ){
            track.enabled = !track.enabled ;
        }
        let data={"status":audioStatus,'share_user_id' : active_meeting_id};
        socket.emit("audio_toogle",data);
    }
    muteParticipant(participentId){
        if(!participentId){return __this.onerror("participant id required");} 
        let data={"status":false,'participant_id' : participentId,meeting_id:active_meeting_id};
        socket.emit("mute_participant_audio",data); 
    }
    unmuteParticipant(participentId){
        if(!participentId){return __this.onerror("participant id required");} 
        let data={"status":true,'participant_id' : participentId,meeting_id:active_meeting_id};
        socket.emit("unmute_participant_audio",data); 
    }
    turnOffVideo(participentId){
        if(!participentId){return __this.onerror("participant id required");} 
        let data={"status":false,'participant_id' : participentId,meeting_id:active_meeting_id};
        socket.emit("off_participant_video",data); 
    }
    turnOnVideo(participentId){
        if(!participentId){return __this.onerror("participant id required");} 
        let data={"status":true,'participant_id' : participentId,meeting_id:active_meeting_id};
        socket.emit("on_participant_video",data); 
    }
    removeParticipant(participentId){
        if(!participentId){return __this.onerror("participant id required");} 
        let data={'participant_id' : participentId,meeting_id:active_meeting_id};
        socket.emit("remove_participant",data); 
    }
    leaveMeeting(){
        let data={'participant_id' : videoLoginUserId,meeting_id:active_meeting_id};
        socket.emit("leave_meeting",data); 
    }
    endMeeting(){
        let data={meeting_id:active_meeting_id};
        socket.emit("end_meeting",data); 
        endConference()
    }

   /** getDevices is used to get audio / video devices **/

    getDevices(callback) {
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
    listenSockets(){
        socket.on("configuration",function(data){
            configurationConferenceVideocall=data;
            __this.onReady();
        });
        socket.on("video_conference_signal",function(data){
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
        socket.on("new_user_joined",function(data){
            if(data.user_id!=videoLoginUserId){
                //initVideoConferenceWebRtc(data.user_id,data.user_id,true);
                if(typeof __this.newUserJoined=="function"){
                    __this.newUserJoined(data);
                }   
            }
        });
        socket.on("mute_participant_audio",function(data){
            if(data.participentId==videoLoginUserId && data.meeting_id==active_meeting_id){
                if (!localVideoStream) return;
                for (let track of localVideoStream.getAudioTracks() ){
                    track.enabled = false ;
                }
                let data={"status":false,'participant_id' : videoLoginUserId,"meeting_id":active_meeting_id};
                socket.emit("audio_change",data);
            }
        })
        socket.on("unmute_participant_audio",function(data){
            if(data.participentId==videoLoginUserId && data.meeting_id==active_meeting_id){
                if (!localVideoStream) return;
                for (let track of localVideoStream.getAudioTracks() ){
                    track.enabled = true;
                }
                let data={"status":true,'participant_id' : videoLoginUserId,"meeting_id":active_meeting_id};
                socket.emit("audio_change",data);
            }
        }) //unmute_participant_audio
        socket.on('audio_change',function(data){
            if(typeof __this.onAudioChange==="function"){
                __this.onAudioChange(data);
            }
        })
        socket.on("video_change",function(data){
            __this.onVideoChange(data);
        });
        socket.on('leave_meeting',function(data){
            if(typeof __this.onUserLeft=="function"){
                __this.onUserLeft(data);
                removeParticipant(data.participant_id);
            }
        })
        socket.on('end_meeting',function(data){
            if(typeof __this.onMeetingEnd=="function"){
                __this.onMeetingEnd(data);
            }
            endConference();
        }) 
        socket.on('cattle_call_error', (error) => {
            console.log(error);
        });
        socket.on('error', (error) => {
           __this.onerror(error);
        });
    }
    
}

function getServers(){
    let data={};
    socket.emit('configuration',data,function(data){
        configurationConferenceVideocall=data;
    })
}

function initVideoConferenceWebRtc(id,toId,negotiate){
    rtcPeerConn[id] = new RTCPeerConnection(configurationConferenceVideocall);
    rtcPeerConn[id].onicecandidate = function (evt) {
        if (evt.candidate){
            socket.emit('video_conference_signal',{type:"candidate", candidate: evt.candidate,from :videoLoginUserId,to : toId,meeting_id : active_meeting_id});
        }
    };
    rtcPeerConn[id].onnegotiationneeded = function () {
        if(rtcPeerConn[id].signalingState != "stable"){
            return;
        }
        if(rtcPeerConn[id]._negotiating === true){
            return;
        }else{
            rtcPeerConn[id]._negotiating = true;
        }
        if(!doNegotication){
            doNegotication = true;
            return;
        }
        rtcPeerConn[id].createOffer().then((desc)=>{
            rtcPeerConn[id].setLocalDescription(desc).then(()=> {
                socket.emit('video_conference_signal',{type:"offer", offer: rtcPeerConn[id].localDescription,from : videoLoginUserId,to : toId,meeting_id : active_meeting_id});
                rtcPeerConn[id]._negotiating = false;
            }).catch(error=>{
                console.log("setLocalDescription error",error);
                rtcPeerConn[id]._negotiating = false;
            });
        }).catch(e=>{
            console.log("offer error",error);
            rtcPeerConn[id]._negotiating = false;
        });
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
                rtcPeerConn[id].createOffer({"iceRestart": true}).then((desc)=>{
                    rtcPeerConn[id].setLocalDescription(desc).then(()=> {
                        socket.emit('video_conference_signal',{type:"offer", offer: rtcPeerConn[id].localDescription,from : videoLoginUserId,to : toId,meeting_id : meeting_id});
                    }).catch(error=>{
                        console.log("setLocalDescription error",error)
                    });
                }).catch(err=>{
                    console.log("offer error",err)
                });
            }else if(rtcPeerConn[id].iceConnectionState == 'connected'){
               //updateConferenceStatus(toId,false,"");
            }else if(rtcPeerConn[id].iceConnectionState == 'closed'){
                //__this.leaveMeeting();
               // updateConferenceStatus(toId,true,"User disconnected..");
            }else if(rtcPeerConn[id].iceConnectionState == 'disconnected'){
                //__this.leaveMeeting();
               // updateConferenceStatus(toId,true,"User disconnected..");
                /*rtcPeerConn[id].close();
                initVideoConferenceWebRtc(id,toId,true);*/
            }
        }catch (e){

        }
    };
    rtcPeerConn[id].onaddstream = function (evt) {
        setConferenceVideo(evt.stream,id);
    };
    if(localVideoStream){
        addConferenceStream(id);
    }else{
        addStream(function(){
            addConferenceStream(id);
        });
    }
}

function setConferenceVideo(stream,id){
    if(typeof __this.userSreamAdded!="undefined"){
        __this.userSreamAdded(stream,id)
    }
}

function addConferenceStream(id){
    if(typeof rtcPeerConn[id] != "undefined"){
        rtcPeerConn[id].addStream(localVideoStream);
    }
}

function removeConferenceStream(id){
    if(typeof rtcPeerConn[id] != "undefined"){
        rtcPeerConn[id].removeStream(localVideoStream);
    }
}
function removeParticipant(id){
    if(typeof rtcPeerConn[id] != "undefined"){
        rtcPeerConn[id].removeStream(localVideoStream);
        rtcPeerConn[id].close();
        rtcPeerConn[id]=null;
        localVideoStream.stop();
    }
    
}
function endConference(){
    for(let key in rtcPeerConn){
        if(rtcPeerConn[key]){
            rtcPeerConn[key].close();
            rtcPeerConn[key]=null;
            localVideoStream.stop();
        }
    }
}


function onVideoConferenceOffer(offer,id,toId) {
    if(typeof rtcPeerConn[id] !== "undefined"){
        if(rtcPeerConn[id].signalingState == "have-local-offer"){
            rtcPeerConn[id].close();
            initVideoConferenceWebRtc(id,toId,true);
            doNegotication=false;
        }
    }else if(!rtcPeerConn[id]){
        initVideoConferenceWebRtc(id,toId,true);
        doNegotication=false;
    }
    rtcPeerConn[id].setRemoteDescription(new RTCSessionDescription(offer)).then(() => {
        rtcPeerConn[id].createAnswer().then(function(answer){
            rtcPeerConn[id].setLocalDescription(answer);
            socket.emit('video_conference_signal',{type:"answer", answer: answer,from :videoLoginUserId,to : toId,meeting_id : active_meeting_id});
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
        doNegotication=true;
    }
    rtcPeerConn[id].setRemoteDescription(new RTCSessionDescription(answer));
}

function onVideoConferenceCandidate(candidate,id,toId) {
    if(!rtcPeerConn[id]){
        initVideoConferenceWebRtc(id,toId,false);
    }
    rtcPeerConn[id].addIceCandidate(new RTCIceCandidate(candidate));
}

function conferenceLogError(err){
    console.log("Err",err);
}

/** addStream is used to set local stream to peer connection **/

function addStream(callback){
    // get a local stream, show it in our video tag and add it to be sent
    if(localVideoStream != null){
        localVideoStream.stop();
    }
    const constraints = {
        audio: audioStatus?{deviceId: audioSource ? audioSource : "default"}:audioStatus,
        video: videoStatus?{deviceId: videoSource ? videoSource : "default"}:videoStatus
      };
      
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        localVideoStream = stream;
        localVideoStream.stop = function () {
            this.getAudioTracks().forEach(function (track) {
                track.stop();
            });
            this.getVideoTracks().forEach(function (track) { //in case... :)
                track.stop();
            });
        };
        // stream.getTracks().forEach(track => rtcPeerConn.addTrack(track, stream));
         localVideoSelector.srcObject =localVideoStream;
         localVideoSelector.muted = true;
         if(callback){
            callback(stream);
         }
        
      }).catch(err=>{
        //alert("Camera device is not readable");
        console.log("media err",err);
      });
}
function leftMeeting(){
    let data={'participant_id' : videoLoginUserId,meeting_id:active_meeting_id};
    socket.emit("leave_meeting",data); 
}
module.exports = CattleCall;
global.CattleCall = CattleCall;
window.CattleCall=CattleCall;