//
//  CustomDialogView.h
//  test
//
//  Created by aei on 4/8/16.
//  Copyright © 2016 actiontec. All rights reserved.
//

#import <UIKit/UIKit.h>

@interface CustomDialogView : UIView

@property (strong, nonatomic) UITextView *contentText;

@property(strong,nonatomic)UIImageView *imageView;

@property(strong,nonatomic)NSString *url;

@property(strong,nonatomic)NSString *ID;

+(instancetype) shareInstance ; 

@end