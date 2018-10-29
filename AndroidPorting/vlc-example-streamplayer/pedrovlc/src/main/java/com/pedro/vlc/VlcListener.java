package com.pedro.vlc;

import org.videolan.libvlc.MediaPlayer;
/**
 * Created by pedro on 25/06/17.
 */
public interface VlcListener {

  void onComplete();

  void onError();

  void onTimeUpdate(MediaPlayer.Event event);
}
